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
import { pickNextPerformance } from './roster-loaders'
import { buildLeaderboard } from './leaderboard-loaders'
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
  usersCard,
  zagrebToday,
  firstNameOf,
  type HomeCard,
  type HomeCardKey,
} from './home-screen'

export interface HomeScreen {
  /** "Dobra večer, Josip." — null for a login with no name of its own. */
  greeting: string | null
  /** "Sutra je nastup." — null when the schedule has nothing left. */
  sentence: string | null
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
  // dancer has to turn up for, public or not (ADR-0024). It is read only for
  // the sentence today; the Moreška card reads the same season when it lands.
  const needSeason = register === 'nastup'

  const [shows, season, inquiriesCount, door, roster, pending, accounts, comps] = await Promise.all([
    needShows ? getUpcomingShows() : Promise.resolve(null),
    needSeason
      ? getSeasonPerformances({ memberId: viewer.me?.id ?? null, voditelj: viewer.voditelj })
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

  const cards: HomeCard[] = []
  for (const key of keys) {
    switch (key) {
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
        const built = board ? buildLeaderboard({ stats: board, myMemberId: viewer.me?.id ?? null }) : null
        cards.push(
          leaderboardCard({
            top: (built?.rows ?? []).slice(0, 3),
            me: built?.me ?? null,
            countWords: APP_STRINGS.home.count,
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
    greeting: greetingLine({
      nowMs,
      firstName: firstNameOf({
        memberName: viewer.me?.name ?? null,
        accountName: viewer.accountName,
      }),
    }),
    sentence: nextSentence({
      // A dancer's sentence is about the next NASTUP, public or not, which is
      // the roster's question; everybody else's is about the next public
      // evening, which is the buyer's.
      date:
        register === 'nastup'
          ? (pickNextPerformance(season?.upcoming ?? [])?.date ?? null)
          : (next?.date ?? null),
      today,
      register,
    }),
    cards,
  }
}
