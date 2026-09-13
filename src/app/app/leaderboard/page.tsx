import { getMySeason } from '@/lib/app/my-season-data'
import { getSeasonStats } from '@/lib/app/stats-data'
import { buildLeaderboard, parseLeaderboardSegment } from '@/lib/app/leaderboard-loaders'
import {
  LEADERBOARD_KINDS,
  boardView,
  kindsOf,
  myStanding,
  rankDancers,
} from '@/lib/app/leaderboard-rank'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { Board, type BoardList } from './Board'
import { LeaderboardSegments } from './LeaderboardSegments'
import { MySeason } from './MySeason'

// `/app/leaderboard` — the Ljestvica screen (#457, #437; merged by #495,
// reskinned by #568).
//
// Two panels: "Ljestvica" is the roster ranked and "Moja sezona" is the
// dancer's own year. **Ljestvica is first and opens by default** since #568
// (Q36): the screen is called Ljestvica, and a tab that opens on something
// other than its own name asks the reader to go looking for it.
//
// Both panels are read on the server whichever the URL opens on, so the toggle
// costs no request, and `?season=` means the same year in either. The board is
// TWO lists — Moreška and Experience — ranked apart; the rules live in
// `lib/app/leaderboard-rank.ts`, pure and tested without a database.
//
// Everything on it is a LINEUP fact, never an attendance answer: saying
// "dolazim" moves no number here (glossary: *Dancer statistics*). That is the
// whole reason the two panels can sit one tap apart without contradicting each
// other.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[]; part?: string | string[] }>
}) {
  const { viewer, refusal } = await openScreen('leaderboard')
  if (refusal) return refusal

  const me = viewer.me
  const params = await searchParams
  const requested = Array.isArray(params.season) ? params.season[0] : params.season
  const segment = parseLeaderboardSegment(Array.isArray(params.part) ? params.part[0] : params.part)

  // Both panels are read and rendered on the server, whichever one the URL
  // opens on: the toggle is then free, and the season link below it means the
  // same thing in either panel.
  const [mine, stats] = await Promise.all([
    getMySeason(requested, me?.id ?? null),
    getSeasonStats(requested),
  ])

  const lists: BoardList[] = LEADERBOARD_KINDS.map((kind) => {
    const confirmed = kindsOf(kind).reduce((sum, k) => sum + stats.confirmedByKind[k], 0)
    const ranked = rankDancers({
      rows: stats.rows,
      kind,
      primaryRoles: stats.primaryRoles,
      myMemberId: me?.id ?? null,
      confirmed,
    })
    return {
      kind,
      label: APP_STRINGS.board.lists[kind],
      view: boardView(ranked),
      standing: myStanding(ranked),
      confirmed,
    }
  })

  // The prekretnice are read off the WHOLE season's count, not off one list:
  // the glossary's milestones are 5, 10, 15 and 20 confirmed nastupa, and an
  // Experience is one of those as much as a Redovna is. That is also why the
  // board next door ranks them apart and this panel does not.
  const board = buildLeaderboard({ stats, myMemberId: me?.id ?? null })
  const myRow = board.rows.find((r) => r.me) ?? null
  const statsRow = me ? (stats.rows.find((r) => r.memberId === String(me.id)) ?? null) : null

  return (
    <AppShell viewer={viewer} screen="leaderboard" season={mine.season}>
      <LeaderboardSegments
        initial={segment}
        season={mine.season}
        seasons={mine.seasons}
        mine={
          <MySeason
            mine={mine}
            hasMember={me != null}
            milestones={
              myRow
                ? {
                    reached: myRow.milestones,
                    next: board.me?.nextMilestone ?? null,
                    fullSeason: myRow.fullSeason,
                  }
                : null
            }
            byKind={statsRow?.byKind ?? null}
          />
        }
        all={<Board lists={lists} season={mine.season} />}
      />
    </AppShell>
  )
}
