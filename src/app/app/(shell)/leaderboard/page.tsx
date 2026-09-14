import { getSeasonStats } from '@/lib/app/stats-data'
import { getDancerProfile } from '@/lib/app/dancer-season-data'
import { getSeasonPerformances } from '@/lib/app/roster-data'
import { profileRings } from '@/lib/app/profile-rings'
import { parseLeaderboardSegment } from '@/lib/app/leaderboard-loaders'
import { pickNextPerformance } from '@/lib/app/roster-loaders'
import {
  LEADERBOARD_KINDS,
  boardView,
  kindsOf,
  leaders,
  listIsRanked,
  myStanding,
  projectedRank,
  rankDancers,
  rankMovement,
  rivalNews,
  seasonKings,
} from '@/lib/app/leaderboard-rank'
import { APP_STRINGS, weekdayAfterU } from '@/lib/app/strings'
import { AppShell } from '../../AppShell'
import { openScreen } from '../../gate'
import { Card } from '../../ui'
import { Board, type BoardList, type BoardProjection } from './Board'
import { DancerProfileView } from './DancerProfileView'
import { LeaderboardSegments } from './LeaderboardSegments'

// `/app/leaderboard` — the Ljestvica screen (#457, #437; merged by #495,
// reskinned by #568, gamified by #607 and #608, rebuilt from the phone by
// #614).
//
// Two panels: "Ljestvica" is the roster ranked and "Moja sezona" is the
// dancer's own year. **Ljestvica is first and opens by default** since #568
// (Q36): the screen is called Ljestvica, and a tab that opens on something
// other than its own name asks the reader to go looking for it.
//
// **Moja sezona is now a profile** (#608): the same `DancerProfileView` another
// dancer's `/app/leaderboard/[memberId]` renders, with one block more — the
// standing card and the rank movement, which are a message to the reader and
// belong on nobody else's screen. One component, so the two can never drift
// into two different accounts of one season.
//
// Both panels are read on the server whichever the URL opens on, so the toggle
// costs no request, and `?season=` means the same year in either. The board is
// TWO lists — Moreška and Experience — ranked apart; the rules live in
// `lib/app/leaderboard-rank.ts`, pure and tested without a database.
//
// **#614 added one query and no new table.** The projection card needs to know
// what is coming and whether the reader has answered, which is exactly what
// Moreška's own season loader already returns, so the board reads the same
// rows rather than inventing a second idea of "the next nastup". It is read
// only where it can be true: the current season, a reader with a Member row,
// and an evening that is not an Experience.
//
// Everything on the board is a LINEUP fact, never an attendance answer: saying
// "dolazim" moves no number here (glossary: *Dancer statistics*). The
// projection is the one place the two meet and it is careful about it — it says
// what the evening WOULD be worth, in the conditional, and the number only
// moves once the postava is confirmed.

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

  // Each list ranked once and kept, because the projection needs the whole
  // ranking and re-ranking for it would be a second opinion about one season.
  const rankings = new Map<string, ReturnType<typeof rankDancers>>()

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
    rankings.set(kind, ranked)
    // Only the Moreška list: the sentence beside it says "nakon zadnje
    // moreške", and an Experience is not one. The comparison is the same
    // season ranked without its most recent confirmed evening, which the
    // loader hands over beside the rows rather than storing anywhere.
    const before =
      kind === 'moreska' ? rankDancers({ rows: stats.rowsBeforeLast, ...common }) : null

    return {
      kind,
      label: APP_STRINGS.board.lists[kind],
      view: boardView(ranked),
      standing: myStanding(ranked),
      confirmed,
      remaining: kindsOf(kind).reduce((sum, k) => sum + stats.remainingByKind[k], 0),
      ranked: listIsRanked(kind, ranked),
      leaders: leaders(ranked),
      movement: before ? rankMovement(ranked, before) : null,
      rival: before ? rivalNews(ranked, before) : null,
      projection: null as BoardProjection | null,
    }
  })

  const moreska = lists.find((l) => l.kind === 'moreska') ?? null

  // What the next nastup would be worth (#614, Q4). Everything here has to be
  // true at once or the card is not drawn: the reader dances, the season on the
  // screen is the one still being played, there IS a next evening, and that
  // evening would actually move them up. "Dođi, i ostaješ trinaesti" is not an
  // invitation, so a projection that changes nothing is simply left out.
  //
  // `remaining > 0` is what pins this to the CURRENT season, and it has to:
  // `getSeasonPerformances` always reads the current calendar year, so a reader
  // looking at 2025 would otherwise get next week's evening projected onto a
  // ranking it can never join. A past season has nothing remaining, by decision.
  if (me?.id && moreska && moreska.remaining > 0) {
    const ranked = rankings.get('moreska') ?? []
    const place = projectedRank(ranked)
    // A reader with no count holds no place, and they are the ones this card is
    // most for: for them the evening is not a climb but the way onto the list,
    // and the card says that instead of naming a place out of nowhere.
    const started = (ranked.find((r) => r.me)?.performances ?? 0) > 0
    const now = moreska.standing?.rank ?? null

    if (place !== null && (!started || (now !== null && place < now))) {
      const season = await getSeasonPerformances({
        memberId: String(me.id),
        voditelj: viewer.voditelj,
        armyCounts: false,
      })
      // The Moreška list's own kinds: an Experience would move a different
      // number, and the card is under the Moreška list.
      const next = pickNextPerformance(season.upcoming.filter((p) => p.kind !== 'experience'))
      if (next) {
        moreska.projection = {
          performanceId: next.id,
          memberId: String(me.id),
          day: weekdayAfterU(next.date),
          place: started ? place : null,
          answer: next.myAnswer,
          canAnswer: next.canAnswer,
        }
      }
    }
  }

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
              rival={moreska?.rival ?? null}
            />
          ) : (
            <Card className="app__lb-nomember">
              <b>{APP_STRINGS.mySeason.noMember}</b>
              <p>{APP_STRINGS.mySeason.noMemberBody}</p>
            </Card>
          )
        }
        all={
          <Board
            lists={lists}
            season={stats.season}
            kings={seasonKings({ rows: stats.rows, kind: 'moreska' })}
          />
        }
      />
    </AppShell>
  )
}
