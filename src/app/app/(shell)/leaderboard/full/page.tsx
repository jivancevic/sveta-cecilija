import Link from 'next/link'
import { getSeasonStats } from '@/lib/app/stats-data'
import { getRunningNiz, getSeasonLongestNiz } from '@/lib/app/niz-data'
import { flameNiz } from '@/lib/app/niz'
import {
  BOARD_FILTERS,
  MARK_OF_ROLE,
  listIsRanked,
  filterCountsTitle,
  filterRanksNiz,
  kindsOf,
  parseBoardFilter,
  parseLeaderboardKind,
  rankDancers,
  roleTallies,
  type BoardFilter,
  type LeaderboardKind,
  type RankRow,
} from '@/lib/app/leaderboard-rank'
import { pluralize } from '@/lib/app/roster-loaders'
import { APP_STRINGS } from '@/lib/app/strings'
import type { DancerStats } from '@/lib/lineup/stats'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
import { FlameMark, List, RoleMark, Section } from '../../../ui'
import { BoardRow } from '../BoardRow'

// `/app/leaderboard/full` — the whole ranking of one list (#568, filtered by
// #607).
//
// Ljestvica shows the top twenty and pins the reader; this is the rest of the
// society. It is a page rather than a "show more" button for one reason: a
// ranking of the whole roster that appears under a tap **moves the screen**,
// and the row a dancer was reading jumps out from under their thumb. Here the
// list is rendered on the server, whole, on first paint — there is no loading
// state, no client fetch and therefore no reflow to mis-time.
//
// **The chips are links, not state** (#607). Each one is a `<Link>` that
// changes `?role=`, so the filtered list arrives rendered for the same reason
// the unfiltered one does, and a link to "the crni kralj list of 2026" is a
// link somebody can send. The URL carries all three facts: `?season=&kind=&role=`.
//
// **The seven chips do two different things and that is the decision** (Q2):
// `crni / bili / bula` select PEOPLE by the army of their primary role and keep
// counting every evening they danced; `crni kralj / bili kralj / otmanović`
// count how many times the title was given. The rule and the reasoning live in
// `leaderboard-rank.ts`; the only thing this page adds is the line under the
// heading that says which of the two numbers the column is showing, because
// "18 evenings" and "18 crowns" look identical in a column of digits.
//
// **Every dancer reads the breakdown.** Until #607 the split and the titles
// were behind `viewer.voditelj`. Confirmed lineups are visible to every
// moreškant (CONTEXT.md → *Dancer statistics*), so the tally was hiding a sum
// of facts the reader could already add up; what it actually protected was the
// empty space in the row, and this screen spends that space on purpose.
//
// The tallies are **exactly the role**, never the army, so they add up to the
// count at the end of the row. A crown in a tally is a COUNTER — "three
// evenings as crni kralj" — and never an identity: a titula belongs to one
// evening's lineup and never to a person (CONTEXT.md → *Title*), which is why
// the disc in front of a NAME on this screen is always a plain army disc with
// the dancer's initials in it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.board

/** The disc a chip or a tally draws for one role. */
function Mark({ role, small = false }: { role: keyof typeof MARK_OF_ROLE; small?: boolean }) {
  const spec = MARK_OF_ROLE[role]
  return <RoleMark army={spec.army} role={spec.role} small={small} />
}

/**
 * The mark in front of a chip: a role's disc, or the flame for Najduži niz.
 *
 * The niz chip has no role to draw, and a flame is what a niz looks like
 * everywhere else in the app. It is the mark WITHOUT a number, because the
 * numbers are in the list under it.
 */
function ChipMark({ filter }: { filter: BoardFilter }) {
  if (filter === 'svi') return null
  if (filterRanksNiz(filter)) return <FlameMark />
  return <Mark role={filter} small />
}

/** The row of seven chips: which slice of the season is being ranked. */
function Filters({
  season,
  kind,
  active,
}: {
  season: number
  kind: LeaderboardKind
  active: BoardFilter
}) {
  const chip = (filter: BoardFilter) => (
    <Link
      key={filter}
      href={`/app/leaderboard/full?season=${season}&kind=${kind}&role=${filter}`}
      className="app__lb-chip"
      aria-current={filter === active ? 'true' : undefined}
      // A link does not carry pressed state, so the current chip says so in
      // words for a reader who cannot see which one is gold.
      aria-label={filter === active ? `${S.filters[filter]} (uključeno)` : S.filters[filter]}
    >
      <ChipMark filter={filter} />
      <span>{S.filters[filter]}</span>
    </Link>
  )

  // The strip is cut at the right edge of a phone, so it needs to LOOK cut:
  // the fade is a wrapper the stylesheet paints over the scroller's last few
  // millimetres (#614, finding 04). Without it the fifth chip simply ended in
  // mid-word and the screen read as broken rather than as scrollable, and two
  // of the seven were effectively invisible.
  return (
    <div className="app__lb-strip">
      {/* `data-no-pull`: pull-to-refresh keeps off a sideways scroller (#633). */}
      <div className="app__lb-filters" data-no-pull="">
        {BOARD_FILTERS.filter((f) => !filterCountsTitle(f) && !filterRanksNiz(f)).map(chip)}
        {/* The rule says the groups count DIFFERENT things: left of the first
            divider a chip picks people and counts their whole season, right of
            it a chip counts how often a title was given (Q2). Seven identical
            buttons in one row said they were seven of the same thing. */}
        <span className="app__lb-strip-div" aria-hidden="true" />
        {BOARD_FILTERS.filter(filterCountsTitle).map(chip)}
        {/* A third meaning behind a second divider (#634): a RUN of evenings
            rather than a count of them. Moreška only, because an Experience is
            not a link in the chain. */}
        {kind === 'moreska' && (
          <>
            <span className="app__lb-strip-div" aria-hidden="true" />
            {BOARD_FILTERS.filter(filterRanksNiz).map(chip)}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * "⚫12 ⚫♔3 🔴3" — the roles this dancer wore, in this list's evenings.
 *
 * **Packed left, in a fixed role order** (#628, variant A), which reverses
 * #614's fixed six-column grid. The grid existed so a reader could compare one
 * role down the list; most moreškanti hold one or two roles, so five of the six
 * cells were empty on most rows and a lone disc floated in the third column.
 * That scatter is the "cijeli popis mi je konfuzan" of the phone round.
 * Column alignment is given up deliberately — it was not paying for itself —
 * and the ORDER is still fixed, so a row still reads "mostly black, a bit of
 * red" before it reads any number.
 */
function Tallies({ row, kind }: { row: DancerStats; kind: LeaderboardKind }) {
  // `roleTallies` is already in `TALLY_ORDER` with the zeros dropped, which is
  // exactly what a packed row needs; the order is not re-applied here.
  const tallies = roleTallies(row, kind)
  if (tallies.length === 0) return null
  return (
    <span className="app__lb-tallies">
      {tallies.map((tally) => (
        <span key={tally.role} className="app__lb-tally">
          <Mark role={tally.role} small />
          <b>{tally.count}</b>
        </span>
      ))}
    </span>
  )
}

export default async function FullLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string | string[]
    kind?: string | string[]
    role?: string | string[]
  }>
}) {
  const { viewer, refusal } = await openScreen('leaderboard')
  if (refusal) return refusal

  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const kind = parseLeaderboardKind(one(params.kind))
  const asked = parseBoardFilter(one(params.role))
  // The niz chip is not offered on the Experience list, so a `?role=niz` that
  // arrives there (an old link, a hand-typed URL) opens on everybody rather
  // than on a ranking of a chain that list is not in (#634).
  const filter = filterRanksNiz(asked) && kind !== 'moreska' ? 'svi' : asked
  const byNiz = filterRanksNiz(filter)

  // Side by side: a season and a niz are two different reads (#628).
  const [stats, niz] = await Promise.all([getSeasonStats(one(params.season)), getRunningNiz()])
  // One more read, and only under the chip that ranks by it (#634): the whole
  // season's chain rather than the sixty-evening window, because a season is
  // its own bound.
  const seasonNiz = byNiz ? await getSeasonLongestNiz(stats.season) : {}
  const confirmed = kindsOf(kind).reduce((sum, k) => sum + stats.confirmedByKind[k], 0)
  const rows = rankDancers({
    rows: stats.rows,
    kind,
    filter,
    primaryRoles: stats.primaryRoles,
    initials: stats.initials,
    myMemberId: viewer.me?.id ?? null,
    confirmed,
    // The Moreška list only: an Experience is not a link in the chain, so the
    // Experience ranking carries no flame (CONTEXT.md → *Niz*).
    //
    // And NOTHING under the niz chip itself: there the number at the end of the
    // row is already a niz, and a flame beside the nickname would put a second,
    // different one at the other end of the same row (#634). The chip's own
    // mark is the flame instead.
    niz: kind === 'moreska' && !byNiz ? niz : {},
    seasonNiz,
  })
  const byId = new Map(stats.rows.map((r) => [String(r.memberId), r]))

  const ranked = listIsRanked(kind, rows)

  return (
    <AppShell
      viewer={viewer}
      screen="leaderboard"
      title={S.full.title}
      season={stats.season}
      // In the header rather than as a row of its own (#614, finding 12): on a
      // screen where every row is a person, the way back was costing one.
      back={{
        href: `/app/leaderboard?season=${stats.season}&part=all`,
        label: S.full.back,
      }}
    >
      <Filters season={stats.season} kind={kind} active={filter} />

      {/* Which number the column is showing: the heading's own caption (#627),
          and it changes with the chip, because the two meanings are
          indistinguishable as digits. */}
      <Section
        title={S.lists[kind]}
        aside={pluralize(rows.length, S.onList)}
        note={
          byNiz ? S.countsNiz : filterCountsTitle(filter) ? S.countsTitle : S.countsEvenings
        }
      />

      {rows.length === 0 ? (
        <p className="app__empty">
          {filter !== 'svi'
            ? S.emptyFilter
            : kind === 'experience'
              ? S.emptyExperience
              : S.empty}
        </p>
      ) : (
        <List>
          {rows.map((row) => (
            <BoardRow
              key={row.memberId}
              row={row}
              season={stats.season}
              ranked={ranked}
              meta={(() => {
                const source = byId.get(row.memberId)
                return source ? <Tallies row={source} kind={kind} /> : undefined
              })()}
            />
          ))}
        </List>
      )}

      {/* What the flame means, said once under the list rather than on seventy
          rows (#628). Only where one can actually appear: the Experience list
          has no niz, because an Experience is not a link in the chain. */}
      {kind === 'moreska' && rows.some((r) => flameNiz(r.niz) !== null) && (
        <p className="app__lb-footer">{APP_STRINGS.profile.nizLegend}</p>
      )}

      <p className="app__lb-footer">{S.footer(pluralize(confirmed, S.confirmedCount))}</p>
    </AppShell>
  )
}
