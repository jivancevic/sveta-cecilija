import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSeasonStats } from '@/lib/app/stats-data'
import {
  BOARD_FILTERS,
  MARK_OF_ROLE,
  filterCountsTitle,
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
import { Chip, List, ListRow, RoleMark, Section, Trophy } from '../../../ui'

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
  return (
    <div className="app__lb-filters">
      {BOARD_FILTERS.map((filter) => (
        <Link
          key={filter}
          href={`/app/leaderboard/full?season=${season}&kind=${kind}&role=${filter}`}
          className="app__lb-chip"
          aria-current={filter === active ? 'true' : undefined}
          // A link does not carry pressed state, so the current chip says so in
          // words for a reader who cannot see which one is gold.
          aria-label={filter === active ? `${S.filters[filter]} (uključeno)` : S.filters[filter]}
        >
          {filter !== 'svi' && <Mark role={filter} small />}
          <span>{S.filters[filter]}</span>
        </Link>
      ))}
    </div>
  )
}

/** "⚫12 ⚫♔3 🔴3" — the roles this dancer wore, in this list's evenings. */
function Tallies({ row, kind }: { row: DancerStats; kind: LeaderboardKind }) {
  const tallies = roleTallies(row, kind)
  if (tallies.length === 0) return null
  return (
    <span className="app__lb-tallies">
      {tallies.map(({ role, count }) => (
        <span key={role} className="app__lb-tally">
          <Mark role={role} small />
          <b>{count}</b>
        </span>
      ))}
    </span>
  )
}

function Row({
  row,
  source,
  kind,
  season,
}: {
  row: RankRow
  /** The scoreboard row behind it, for the breakdown; absent for nobody. */
  source: DancerStats | undefined
  kind: LeaderboardKind
  season: number
}) {
  return (
    <ListRow
      href={`/app/leaderboard/${row.memberId}?season=${season}`}
      className={row.me ? 'app__lb-row--me' : undefined}
      lead={
        <span className="app__lb-lead">
          <i className="app__lb-rank">{S.rank(row.rank)}</i>
          {/* The top three wear their cup instead of their disc: the place is
              the more specific fact about a row at the top of a ranking, and
              two 28px marks side by side is one mark too many for a phone. */}
          {row.rank <= 3 ? (
            <Trophy place={row.rank} small />
          ) : (
            <RoleMark army={row.army} title={row.title} initials={row.initials} small />
          )}
        </span>
      }
      title={row.nickname}
      meta={source ? <Tallies row={source} kind={kind} /> : undefined}
      trail={<b className="app__lb-count">{row.performances}</b>}
    >
      {row.me && <Chip tone="gold">{S.you}</Chip>}
    </ListRow>
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
  const filter = parseBoardFilter(one(params.role))

  const stats = await getSeasonStats(one(params.season))
  const confirmed = kindsOf(kind).reduce((sum, k) => sum + stats.confirmedByKind[k], 0)
  const rows = rankDancers({
    rows: stats.rows,
    kind,
    filter,
    primaryRoles: stats.primaryRoles,
    initials: stats.initials,
    myMemberId: viewer.me?.id ?? null,
    confirmed,
  })
  const byId = new Map(stats.rows.map((r) => [String(r.memberId), r]))

  return (
    <AppShell viewer={viewer} screen="leaderboard" title={S.full.title} season={stats.season}>
      <Link
        className="ui-btn ui-btn--link app__lb-back"
        href={`/app/leaderboard?season=${stats.season}&part=all`}
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        {S.full.back}
      </Link>

      <Filters season={stats.season} kind={kind} active={filter} />

      <Section title={S.lists[kind]} aside={pluralize(rows.length, S.onList)} />
      {/* Which number the column is showing. One line, and it changes with the
          chip, because the two meanings are indistinguishable as digits. */}
      <p className="app__lb-hint">
        {filterCountsTitle(filter) ? S.countsTitle : S.countsEvenings}
      </p>

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
            <Row
              key={row.memberId}
              row={row}
              source={byId.get(row.memberId)}
              kind={kind}
              season={stats.season}
            />
          ))}
        </List>
      )}

      <p className="app__lb-footer">{S.footer(pluralize(confirmed, S.confirmedCount))}</p>
    </AppShell>
  )
}
