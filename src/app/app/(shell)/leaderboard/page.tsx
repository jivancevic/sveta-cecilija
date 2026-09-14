import { getSeasonStats } from '@/lib/app/stats-data'
import { getDancerProfile } from '@/lib/app/dancer-season-data'
import { profileRings } from '@/lib/app/profile-rings'
import { parseLeaderboardSegment } from '@/lib/app/leaderboard-loaders'
import {
  LEADERBOARD_KINDS,
  boardView,
  kindsOf,
  myStanding,
  rankDancers,
  rankMovement,
} from '@/lib/app/leaderboard-rank'
import { APP_STRINGS } from '@/lib/app/strings'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Card } from '../../ui'
import { Board, type BoardList } from './Board'
import { DancerProfileView } from './DancerProfileView'
import { LeaderboardSegments } from './LeaderboardSegments'

// `/app/leaderboard` — the Ljestvica screen (#457, #437; merged by #495,
// reskinned by #568, gamified by #607 and #608).
//
// Two panels: "Ljestvica" is the roster ranked and "Moja sezona" is the
// dancer's own year. **Ljestvica is first and opens by default** since #568
// (Q36): the screen is called Ljestvica, and a tab that opens on something
// other than its own name asks the reader to go looking for it.
//
// **Moja sezona is now a profile** (#608): the same `DancerProfileView` another
// dancer's `/app/leaderboard/[memberId]` renders, with one block more — the
// standing sentence and the rank movement, which are a message to the reader
// and belong on nobody else's screen. One component, so the two can never drift
// into two different accounts of one season.
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

  // The season's scoreboard is what BOTH panels are built from: the board ranks
  // it and the profile takes its rings off the same ranking, so the two can
  // never print two places for one dancer.
  const stats = await getSeasonStats(requested)

  // A voditelj with no Member row has no dancer to show. The panel then says so
  // and prints the SEASON's numbers, which are facts they can still use.
  const profile = me ? await getDancerProfile(String(me.id), stats.season, stats.seasons) : null

  const lists: BoardList[] = LEADERBOARD_KINDS.map((kind) => {
    const confirmed = kindsOf(kind).reduce((sum, k) => sum + stats.confirmedByKind[k], 0)
    const common = {
      kind,
      primaryRoles: stats.primaryRoles,
      initials: stats.initials,
      myMemberId: me?.id ?? null,
      confirmed,
    }
    const ranked = rankDancers({ rows: stats.rows, ...common })
    return {
      kind,
      label: APP_STRINGS.board.lists[kind],
      view: boardView(ranked),
      standing: myStanding(ranked),
      confirmed,
      // Only the Moreška list: the sentence beside it says "nakon zadnje
      // moreške", and an Experience is not one. The comparison is the same
      // season ranked without its most recent confirmed evening, which the
      // loader hands over beside the rows rather than storing anywhere.
      movement:
        kind === 'moreska'
          ? rankMovement(ranked, rankDancers({ rows: stats.rowsBeforeLast, ...common }))
          : null,
    }
  })

  const moreska = lists.find((l) => l.kind === 'moreska') ?? null

  return (
    <AppShell viewer={viewer} screen="leaderboard" season={stats.season}>
      <LeaderboardSegments
        initial={segment}
        season={stats.season}
        seasons={stats.seasons}
        mine={
          profile ? (
            <DancerProfileView
              profile={profile}
              rings={profileRings({
                stats,
                memberId: profile.identity.memberId,
                mine: true,
              })}
              mine
              standing={moreska?.standing ?? null}
              movement={moreska?.movement ?? null}
            />
          ) : (
            <Card className="app__lb-nomember">
              <b>{APP_STRINGS.mySeason.noMember}</b>
              <p>{APP_STRINGS.mySeason.noMemberBody}</p>
            </Card>
          )
        }
        all={<Board lists={lists} season={stats.season} />}
      />
    </AppShell>
  )
}
