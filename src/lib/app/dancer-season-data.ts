import { getPayload } from 'payload'
import config from '@payload-config'
import { getRepo } from '@/lib/repo'
import { toIsoDate } from '@/lib/to-iso-date'
import { relationIdString } from '@/lib/payload-relation'
import { isDanceRole } from '@/lib/moreskant-profile'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import { SHOWN_PERFORMANCE_WHERE, type PerformanceKind } from '@/lib/show-performance'
import { buildMySeason, type MySeason } from './my-season-loaders'
import { initialsOf } from './members-screen'
import { longestNiz, type LongestNiz } from './niz'
import { loadNizChain } from './niz-data'
import {
  dancerEvenings,
  toDancerIdentity,
  type DancerEvening,
  type DancerIdentity,
  type DancerSeasonLineupRow,
  type DancerSeasonPerformance,
} from './dancer-season'

// The IO wiring behind the season profile (#608) — the `my-season-data.ts`
// shape: the Payload calls and nothing else, so every rule about what a profile
// shows stays in the pure, unit-tested `dancer-season.ts`.
//
// **One pair of season queries feeds two things.** The month chart and the list
// of evenings are the same shows and the same lineups read twice, so the loader
// asks once and hands the rows to `buildMySeason` and to `dancerEvenings`. The
// alternative — calling `getMySeason` and then querying the season again for
// the list — was two round trips for one season on a phone.
//
// The local API runs with `overrideAccess: true`, so collection access scopes
// none of these reads; the caller has already established through the `/app`
// access decision that the viewer is on the roster. Who may be READ here is
// therefore decided by the projection in `dancer-season.ts`, not by Payload.

/** Everything the profile draws about one dancer in one season. */
export interface DancerProfile {
  identity: DancerIdentity
  /** The chart, the totals and the role split: `buildMySeason`, for this person. */
  season: MySeason
  /** The evenings they danced, newest first. */
  evenings: DancerEvening[]
  /**
   * Their longest niz ever (#628), and whether it is the one still going.
   *
   * A record across ALL seasons, because it is taking a record's place. Length
   * zero for a dancer who has never been in a confirmed postava; the screen
   * says so in words rather than drawing a flame with a nought in it.
   */
  niz: LongestNiz
  /**
   * The run's two ends as dates, YYYY-MM-DD (#634).
   *
   * `LongestNiz` names them by performance id, which is what the pure function
   * has; the screen prints "Od 14.7. do 19.8." and needs the days. Null for a
   * dancer with no run at all. Both are evenings this dancer DANCED, never the
   * one they missed.
   */
  nizRange: { from: string; to: string } | null
}

/** Croatian, because every `/app` screen is. The venue names buyers read. */
const venueLabel = (value: unknown): string | null =>
  typeof value === 'string' && value in VENUE_LABEL.hr ? VENUE_LABEL.hr[value as Venue] : null

function toPerformance(doc: Record<string, unknown>): DancerSeasonPerformance {
  return {
    id: String(doc.id),
    date: toIsoDate(doc.date),
    kind: (doc.kind as PerformanceKind) ?? 'redovna',
    place: venueLabel(doc.venue),
    confirmed: doc.lineupConfirmed === true,
    cancelled: doc.status === 'cancelled',
    isPublic: doc.isPublic === true,
  }
}

function toLineupRow(doc: Record<string, unknown>): DancerSeasonLineupRow | null {
  const performanceId = relationIdString(doc.performance)
  const memberId = relationIdString(doc.member)
  if (!performanceId || !memberId) return null
  // A `voditelj` line is not a dance role: running an evening is not dancing it,
  // so it reaches neither the chart nor the list (CONTEXT.md → *Voditelj (u
  // postavi)*).
  if (!isDanceRole(doc.role)) return null
  return { performanceId, memberId, role: doc.role }
}

/**
 * One dancer's profile, or null when the id is not an active moreškant's.
 *
 * The identity comes through the repository seam (`repo.members.byId`), which
 * is what an `/app` screen is supposed to use; everything with a season in it
 * still reads Payload directly, the way `my-season-data.ts` and
 * `stats-data.ts` do, until the seam grows a lineups reader.
 */
export async function getDancerProfile(
  memberId: string,
  season: number,
  seasons: readonly number[],
): Promise<DancerProfile | null> {
  const row = await getRepo().members.byId(memberId)
  const identity = toDancerIdentity(row, row ? initialsOf(row.name) : '')
  if (!identity) return null

  const payload = await getPayload({ config })

  const showDocs = (
    await payload.find({
      collection: 'shows',
      where: {
        and: [
          { date: { greater_than_equal: `${season}-01-01T00:00:00.000Z` } },
          { date: { less_than: `${season + 1}-01-01T00:00:00.000Z` } },
          // The profile counts what Ljestvica counts (#635).
          SHOWN_PERFORMANCE_WHERE,
        ],
      },
      sort: 'date',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Record<string, unknown>[]

  const performances = showDocs.map(toPerformance)
  const confirmedIds = performances.filter((p) => p.confirmed && !p.cancelled).map((p) => p.id)

  // Scoped to this one dancer, like Moja sezona's: the profile is about one
  // person, so it reads one person's rows rather than the season's.
  const lineupDocs =
    confirmedIds.length > 0
      ? ((
          await payload.find({
            collection: 'lineups',
            where: {
              and: [{ performance: { in: confirmedIds } }, { member: { equals: identity.memberId } }],
            },
            limit: 5000,
            depth: 0,
            overrideAccess: true,
          })
        ).docs as unknown as Record<string, unknown>[])
      : []

  const lineups = lineupDocs
    .map(toLineupRow)
    .filter((r): r is DancerSeasonLineupRow => r !== null)

  // ── The record: every season, not this one ───────────────────────────────
  // Two queries rather than a join, and they stay small because both are
  // scoped to one dancer: their lineup rows, then the evenings behind them.
  // Since #628 the record is a NIZ, so a third read joins them: the society's
  // whole chain of confirmed moreške, which is what a run is counted along.
  // The dancer's own rows cannot produce it — a niz is broken by an evening
  // they were NOT in, and an evening they were not in leaves them no row.
  const allLineupDocs = (
    await payload.find({
      collection: 'lineups',
      where: { member: { equals: identity.memberId } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as unknown as Record<string, unknown>[]

  const allIds = [
    ...new Set(
      allLineupDocs
        .map((doc) => relationIdString(doc.performance))
        .filter((id): id is string => id !== null),
    ),
  ]

  const allShowDocs =
    allIds.length > 0
      ? ((
          await payload.find({
            collection: 'shows',
            where: { and: [{ id: { in: allIds } }, SHOWN_PERFORMANCE_WHERE] },
            limit: 5000,
            depth: 0,
            overrideAccess: true,
          })
        ).docs as unknown as Record<string, unknown>[])
      : []

  // Unbounded on purpose, unlike the list's window: this is one dancer and one
  // small read, and a record that stopped at sixty evenings would be a record
  // with a ceiling in it.
  const chain = await loadNizChain(2000)

  const everEvenings = dancerEvenings({
    performances: allShowDocs.map(toPerformance),
    lineups: allLineupDocs
      .map(toLineupRow)
      .filter((r): r is DancerSeasonLineupRow => r !== null),
    memberId: identity.memberId,
  })

  const longest = longestNiz(chain, new Set(everEvenings.map((e) => e.performanceId)))
  // Both ends are evenings this dancer was in, by construction, so their dates
  // are in the evenings just built rather than needing a read of their own.
  const dateOf = new Map(everEvenings.map((e) => [e.performanceId, e.date]))
  const from = longest.from ? (dateOf.get(longest.from) ?? null) : null
  const to = longest.to ? (dateOf.get(longest.to) ?? null) : null

  return {
    identity,
    season: buildMySeason({
      season,
      seasons,
      performances: performances.map((p) => ({
        id: p.id,
        date: p.date,
        confirmed: p.confirmed,
        cancelled: p.cancelled,
      })),
      lineups,
      memberId: identity.memberId,
    }),
    evenings: dancerEvenings({ performances, lineups, memberId: identity.memberId }),
    niz: longest,
    nizRange: from && to ? { from, to } : null,
  }
}
