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
import { PERFORMANCE_KINDS } from '@/lib/show-performance'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Chip, List, ListRow, RoleMark, Section } from '../../ui'

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
// A `moreska` holder reads one line more per row: the titles and the kinds
// behind the count, which is what the old voditelj scoreboard put in six
// columns (#437). It is a line rather than a table because a phone carries a
// sentence better than it carries six numeric columns, and because the reader
// who wants the season by evening has Statistika and Izvedbe for that.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const S = APP_STRINGS.board

/** "2 crni kralj · 8 Redovna · 2 Adriatic DMC" — the count, unpacked. */
function breakdown(row: DancerStats, kinds: readonly string[]): string | null {
  const parts = [
    ...STAT_ROLES.filter((r) => row.roles[r] > 0).map(
      (r) => `${row.roles[r]} ${ROLE_LABELS[r].toLocaleLowerCase('hr')}`,
    ),
    ...PERFORMANCE_KINDS.filter((k) => kinds.includes(k) && row.byKind[k] > 0).map(
      (k) => `${row.byKind[k]} ${KIND_LABELS[k]}`,
    ),
  ]
  return parts.length > 0 ? S.full.breakdown(parts) : null
}

function Row({ row, meta }: { row: RankRow; meta: string | null }) {
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
      meta={meta ?? (row.fullSeason ? S.fullSeason : undefined)}
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
            return (
              <Row
                key={row.memberId}
                row={row}
                meta={viewer.voditelj && source ? breakdown(source, kinds) : null}
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
