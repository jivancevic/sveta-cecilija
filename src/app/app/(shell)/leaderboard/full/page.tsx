import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSeasonStats } from '@/lib/app/stats-data'
import {
  kindsOf,
  parseLeaderboardKind,
  rankDancers,
  type RankRow,
} from '@/lib/app/leaderboard-rank'
import { pluralize } from '@/lib/app/roster-loaders'
import { APP_STRINGS, KIND_LABELS, ROLE_LABELS } from '@/lib/app/strings'
import { STAT_ROLES, type DancerStats } from '@/lib/lineup/stats'
import { PERFORMANCE_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { AppShell } from '../../../AppShell'
import { openScreen } from '../../../gate'
import { Chip, List, ListRow, RoleMark, Section } from '../../../ui'

// `/app/leaderboard/full` — the whole ranking of one list (#568).
//
// Ljestvica shows the top twenty and pins the reader; this is the rest of the
// society. It is a page rather than a "show more" button for one reason: a
// ranking of the whole roster that appears under a tap **moves the screen**,
// and the row a dancer was reading jumps out from under their thumb. Here the
// list is rendered on the server, whole, on first paint — there is no loading
// state, no client fetch and therefore no reflow to mis-time.
//
// Same gate as the screen it comes from (`leaderboard`), and `activeTabKey`
// lights Ljestvica for it, because the tab rule matches a route's PREFIX
// (`lib/app/screens.ts`).
//
// A `moreska` holder reads one line more per row: **which evenings** the count
// is made of ("9 Redovna · 7 Adriatic DMC"), which is the split the old
// voditelj scoreboard hid behind a tap (#437, story 40). A line rather than a
// table because a phone carries a sentence better than six numeric columns.
//
// Under it, quieter, are the four titles the same scoreboard put in four
// columns: "2 × crni kralj · 1 × otmanović". They come from `rolesByKind`
// and summed over THIS list's kinds, never from `roles`, which is the whole
// season: a titles line drawn from the season sat next to a count that excluded
// the Experiences it was counting, and showed "6 crni kralj · 17 bili kralj"
// against a count of 19. Two numbers that do not add up are worse than one
// number that is not there.
//
// Only the four titles, only above zero, and a dancer who wore none this season
// gets no line: a titula is given per evening (CONTEXT.md → *Title*), and a row
// of zeros would say something about a dancer that is not about them.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.board

/** "8 Redovna · 2 Adriatic DMC" — which evenings the count is made of. */
function breakdown(row: DancerStats, kinds: readonly PerformanceKind[]): string | null {
  const parts = PERFORMANCE_KINDS.filter((k) => kinds.includes(k) && row.byKind[k] > 0).map(
    (k) => `${row.byKind[k]} ${KIND_LABELS[k]}`,
  )
  // One kind is not a split, it is the count again: the Experience list is
  // every row, and a dancer who only ever danced Redovne needs no line either.
  return parts.length > 1 ? S.full.breakdown(parts) : null
}

/** "2 × crni kralj · 1 × otmanović" — the titles worn in THOSE evenings. */
function titles(row: DancerStats, kinds: readonly PerformanceKind[]): string | null {
  const counted = STAT_ROLES.map((title) => ({
    title,
    count: kinds.reduce((sum, k) => sum + row.rolesByKind[k][title], 0),
  })).filter((t) => t.count > 0)

  return counted.length > 0
    ? S.full.breakdown(
        counted.map((t) => S.full.worn(t.count, ROLE_LABELS[t.title].toLocaleLowerCase('hr'))),
      )
    : null
}

function Row({
  row,
  split,
  worn,
}: {
  row: RankRow
  /** Which evenings the count is made of; `moreska` only. */
  split: string | null
  /** The titles worn in them; `moreska` only. */
  worn: string | null
}) {
  // "Puna sezona" is a fact about the dancer and the split is a fact about the
  // count; the voditelj's detail ADDS to the row rather than replacing what
  // every reader sees, so all three stack in that order (review, #582).
  const meta =
    row.fullSeason || split || worn ? (
      <>
        {row.fullSeason && <span className="app__lb-meta-line">{S.fullSeason}</span>}
        {split && <span className="app__lb-meta-line">{split}</span>}
        {worn && <span className="app__lb-meta-line app__lb-titles">{worn}</span>}
      </>
    ) : undefined

  return (
    <ListRow
      className={row.me ? 'app__lb-row--me' : undefined}
      lead={
        <span className="app__lb-lead">
          <i className="app__lb-rank">{S.rank(row.rank)}</i>
          <RoleMark army={row.army} title={row.title} small />
        </span>
      }
      title={row.nickname}
      meta={meta}
      trail={<b className="app__lb-count">{row.performances}</b>}
    >
      {row.me && <Chip tone="gold">{S.you}</Chip>}
    </ListRow>
  )
}

export default async function FullLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[]; kind?: string | string[] }>
}) {
  const { viewer, refusal } = await openScreen('leaderboard')
  if (refusal) return refusal

  const params = await searchParams
  const requested = Array.isArray(params.season) ? params.season[0] : params.season
  const kind = parseLeaderboardKind(Array.isArray(params.kind) ? params.kind[0] : params.kind)

  const stats = await getSeasonStats(requested)
  const kinds = kindsOf(kind)
  const confirmed = kinds.reduce((sum, k) => sum + stats.confirmedByKind[k], 0)
  const rows = rankDancers({
    rows: stats.rows,
    kind,
    primaryRoles: stats.primaryRoles,
    myMemberId: viewer.me?.id ?? null,
    confirmed,
  })
  const byId = new Map(stats.rows.map((r) => [String(r.memberId), r]))

  const label = S.lists[kind]

  return (
    <AppShell viewer={viewer} screen="leaderboard" title={S.full.title} season={stats.season}>
      <Link
        className="ui-btn ui-btn--link app__lb-back"
        href={`/app/leaderboard?season=${stats.season}&part=all`}
      >
        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        {S.full.back}
      </Link>

      <Section title={label} aside={pluralize(rows.length, S.onList)} />

      {rows.length === 0 ? (
        <p className="app__empty">{kind === 'experience' ? S.emptyExperience : S.empty}</p>
      ) : (
        <List>
          {rows.map((row) => {
            const source = byId.get(row.memberId)
            const detail = viewer.voditelj && source
            return (
              <Row
                key={row.memberId}
                row={row}
                split={detail ? breakdown(source, kinds) : null}
                worn={detail ? titles(source, kinds) : null}
              />
            )
          })}
        </List>
      )}

      <p className="app__lb-footer">
        {S.footer(pluralize(confirmed, S.confirmedCount))}
      </p>
    </AppShell>
  )
}
