// What Početna loads on the server (#564).
//
// The IO wiring and nothing else, in the `stats-screen-data.ts` shape: which
// cards a reader gets is `homeCardKeys` (pure, off the bar), what each card
// SAYS is `home-screen.ts` (pure), and this file only asks.
//
// **It asks only for the cards it is going to draw.** A `partner` login never
// touches the orders table and a blagajna login never loads the roster: the
// loads are keyed off the same list the page renders, so a card that is not on
// the screen costs nothing. That is also why nothing here is a "dashboard
// query" — every figure comes from the loader its own screen already uses
// (`countNewInquiries`, `loadDoorShow`, `loadSellScreen`, `loadFinanceScreen`,
// `getSeasonStats`, `loadRoster`, `loadAccounts`), so a number on Početna and
// the same number one tap away cannot disagree.
//
// Data reaches the database through `getRepo()` or through `src/lib/shows.ts`,
// the two sanctioned entry points; this file imports no Payload and needs no
// entry in the repo guard's allow-list.

import { getRepo } from '@/lib/repo'
import { getUpcomingShows } from '@/lib/shows'
import { seasonYear } from '@/lib/member/season'
import { VENUE_CAPACITY } from '@/lib/venues'
import type { AppViewer } from './viewer'
import { getMyNotifications } from './notifications-data'
import { countNewInquiries } from './inquiries-data'
import { countOrders } from './orders-data'
import { loadDoorShow } from './scan-data'
import { loadSellScreen } from './sell-data'
import { loadFinanceScreen } from './finance-data'
import { loadRoster } from './members-data'
import { getPendingJoinClaims } from './join-data'
import { loadAccounts } from './users-data'
import { getSeasonStats } from './stats-data'
import { getSeasonPerformances } from './roster-data'
import { pickNextPerformance, type RosterPerformance } from './roster-loaders'
import { armyLabel, heroView, type HeroView } from './moreska-screen'
import { kindsOf, myStanding, rankDancers } from './leaderboard-rank'
import { formatEur } from './orders-view'
import { APP_STRINGS } from './strings'
import {
  compCard,
  financeCard,
  greetingLine,
  homeCardKeys,
  inboxCard,
  inquiriesCard,
  leaderboardCard,
  membersCard,
  nextSentence,
  ordersCard,
  performancesCard,
  registerFor,
  scanCard,
  sellCard,
  statementCard,
  statsCard,
  moreskaEmptyCard,
  usersCard,
  zagrebToday,
  firstNameOf,
  type HomeCard,
  type HomeCardKey,
} from './home-screen'

/**
 * The Moreška card: the hero of the next nastup, with the answer in it (#565).
 *
 * It is not a tile, which is why it is not in `cards`: T1's rule is that a
 * screen has one hero or none, and on Početna the hero is the evening a dancer
 * came to answer for. Everything in it is `moreska-screen.ts`'s, so the card
 * and the Moreška screen itself can never describe the same evening differently.
 */
export interface MoreskaHero {
  hero: HeroView
  performanceId: string
  /** The reader's own Member, or null for a voditelj who does not dance. */
  memberId: string | null
  answer: RosterPerformance['myAnswer']
  /** "Crni" / "Bili" as the server recorded it, or null. */
  army: string | null
  canAnswer: boolean
}

export interface HomeScreen {
  /** "Dobra večer, Josip." — null for a login with no name of its own. */
  greeting: string | null
  /** "Sutra je nastup." — null when the schedule has nothing left. */
  sentence: string | null
  /** The hero, when the account carries the Moreška tab and has a nastup left. */
  moreska: MoreskaHero | null
  /** The cards, in the account's tab order, Obavijesti last. Four at most. */
  cards: HomeCard[]
}

/** The next public evening, as the two cards that need one read it. */
interface NextPublic {
  id: string
  date: string
  sold: number
  capacity: number
}

export async function loadHomeScreen(viewer: AppViewer): Promise<HomeScreen> {
  const keys = homeCardKeys(viewer.nav)
  const has = (key: HomeCardKey) => keys.includes(key)

  // One clock for the whole screen, read here rather than in a component: the
  // greeting, the sentence and "karata za sutra" all have to agree, and a
  // render that read `Date.now()` for itself is both impure and a chance for
  // two of them to land on different sides of midnight.
  const nowMs = Date.now()
  const today = zagrebToday(nowMs)
  const register = registerFor(viewer.permissions)

  // The public schedule is three cards' input and, for a reader in the selling
  // register, the sentence's too: one read, never four.
  const needShows =
    has('stats') || has('performances') || has('orders') || register === 'izvedba'

  // The roster's own schedule, which is a different question: every evening a
  // dancer has to turn up for, public or not (ADR-0024). One read serves both
  // the sentence and the Moreška hero.
  const needSeason = has('moreska') || register === 'nastup'

  const [shows, season, inquiriesCount, door, roster, pending, accounts, comps] = await Promise.all([
    needShows ? getUpcomingShows() : Promise.resolve(null),
    needSeason
      ? getSeasonPerformances({
          memberId: viewer.me?.id ?? null,
          voditelj: viewer.voditelj,
          // The hero draws the ArmyBar for a dancer too (#565): "are we enough
          // tonight" is a question the whole roster reads. Asked for only when
          // the hero is going to be drawn, so a dancer whose bar has no Moreška
          // tab does not pay for two headcount queries.
          armyCounts: has('moreska'),
        })
      : Promise.resolve(null),
    has('inquiries') ? countNewInquiries() : Promise.resolve(null),
    has('scan') ? loadDoorShow() : Promise.resolve(null),
    has('members') ? loadRoster() : Promise.resolve(null),
    has('members') ? getPendingJoinClaims() : Promise.resolve(null),
    has('users') ? loadAccounts() : Promise.resolve(null),
    has('comp')
      ? getRepo().comp.ticketsInSeason(seasonYear(new Date(nowMs)))
      : Promise.resolve(null),
  ])

  const next: NextPublic | null = shows?.[0]
    ? {
        id: shows[0].id,
        date: shows[0].date,
        capacity: VENUE_CAPACITY[shows[0].venue],
        // `remaining` is capacity minus every seat that is gone, ledger seats
        // included, so the sold figure is its complement rather than a fourth
        // way to count a house.
        sold: Math.max(0, VENUE_CAPACITY[shows[0].venue] - shows[0].remaining),
      }
    : null

  // The second batch needs `next` (the orders card counts the next evening's
  // orders), so it cannot join the first.
  const [orderCount, sell, finance, board, inbox] = await Promise.all([
    has('orders') ? countOrders(next?.id ?? null) : Promise.resolve(null),
    has('sell')
      ? loadSellScreen(viewer.access.kind === 'ok' ? viewer.access.partnerId : null)
      : Promise.resolve(null),
    has('finance') ? loadFinanceScreen({}) : Promise.resolve(null),
    has('leaderboard') ? getSeasonStats(undefined) : Promise.resolve(null),
    has('notifications') ? getMyNotifications(viewer.userId) : Promise.resolve(null),
  ])

  const nextNastup = pickNextPerformance(season?.upcoming ?? [])
  const moreska: MoreskaHero | null =
    has('moreska') && nextNastup
      ? {
          hero: heroView(nextNastup),
          performanceId: nextNastup.id,
          memberId: viewer.me?.id ?? null,
          answer: nextNastup.myAnswer,
          army: armyLabel(nextNastup.myArmy),
          canAnswer: nextNastup.canAnswer,
        }
      : null

  const cards: HomeCard[] = []
  for (const key of keys) {
    switch (key) {
      case 'moreska':
        // The hero, not a tile — unless the season has nothing left, in which
        // case there is no evening to be the hero of and the card says so.
        if (!moreska) cards.push(moreskaEmptyCard((season?.past.length ?? 0) > 0))
        break
      case 'orders':
        cards.push(ordersCard({ count: orderCount ?? 0, forNextShow: next !== null }))
        break
      case 'inquiries':
        cards.push(inquiriesCard(inquiriesCount ?? 0))
        break
      case 'performances':
        cards.push(performancesCard(shows?.length ?? 0))
        break
      case 'members':
        cards.push(
          membersCard({
            active: (roster?.members ?? []).filter((m) => m.active).length,
            pending: pending?.length ?? 0,
          }),
        )
        break
      case 'users':
        cards.push(usersCard(accounts?.length ?? 0))
        break
      case 'comp':
        cards.push(compCard(comps ? comps.filter((t) => !t.cancelled).length : null))
        break
      case 'sell':
        cards.push(
          sellCard({
            ticketsSold: sell?.month.ticketsSold ?? 0,
            monthLabel: sell?.monthLabel ?? '',
          }),
        )
        break
      case 'statement':
        cards.push(statementCard())
        break
      case 'scan':
        cards.push(scanCard(door?.progress ?? null))
        break
      case 'finance':
        // The one euro figure on this screen, and it is already a string by the
        // time it leaves this file: `home-screen.ts` knows nothing about cents.
        cards.push(financeCard(formatEur(finance?.money.collectedCents ?? 0)))
        break
      case 'stats':
        cards.push(statsCard(next ? { ...next, today } : null))
        break
      case 'leaderboard': {
        // The MOREŠKA list, not the whole season (#568): the card's podium and
        // its "ti si N." have to be the ones the reader finds when they tap it,
        // and the screen opens on that list. A season ranked one way on the
        // card and another on the screen would be the same mistake as two
        // aggregations of one season.
        const ranked = board
          ? rankDancers({
              rows: board.rows,
              kind: 'moreska',
              myMemberId: viewer.me?.id ?? null,
              confirmed: kindsOf('moreska').reduce(
                (sum, k) => sum + board.confirmedByKind[k],
                0,
              ),
            })
          : []
        const standing = myStanding(ranked)
        cards.push(
          leaderboardCard({
            top: ranked.slice(0, 3),
            me: standing,
            // Ljestvica answers to `moreskant` and `moreska` and to nobody
            // else, so its count is in the dancer's register: "1. s 11
            // nastupa", never "izvedbi" (CONTEXT.md, two registers). The
            // INSTRUMENTAL of it, because the sentence is "s …" (#568): the
            // nominative read "ti si 4. s 1 nastup".
            countWords: APP_STRINGS.board.withCount,
          }),
        )
        break
      }
      case 'notifications': {
        const latest = inbox?.rows[0] ?? null
        cards.push(
          inboxCard({
            latest: latest ? { title: latest.title, body: latest.body } : null,
            unread: viewer.unreadNotifications,
          }),
        )
        break
      }
      default:
        // A screen with no card of its own draws none: Početna is four glances,
        // not a mirror of the bar. The tab is still how you reach it.
        break
    }
  }

  return {
    moreska,
    greeting: greetingLine({
      nowMs,
      shared: viewer.shared,
      firstName: firstNameOf({
        memberName: viewer.me?.name ?? null,
        accountName: viewer.accountName,
      }),
    }),
    sentence: nextSentence({
      // A dancer's sentence is about the next NASTUP, public or not, which is
      // the roster's question; everybody else's is about the next public
      // evening, which is the buyer's.
      date: register === 'nastup' ? (nextNastup?.date ?? null) : (next?.date ?? null),
      today,
      register,
    }),
    cards,
  }
}
