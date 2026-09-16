// What Početna loads on the server (#564, restructured in #627).
//
// The IO wiring and nothing else, in the `stats-screen-data.ts` shape: which
// cards a reader gets is `homeCardPlan` (pure, off the nav), what each card
// SAYS is `home-screen.ts` (pure), and this file only asks.
//
// **It asks per CARD, and that is what lets the second half stream** (#627).
// It used to be two `Promise.all` blocks over every card at once, which meant
// nothing painted until the slowest query in the reader's whole permission set
// had landed — fine for four cards, not for thirteen. Now `loadHomeCard` loads
// exactly one card, the page awaits the primary half and hands each secondary
// card to its own `<Suspense>` boundary, and React streams them in as they
// arrive. See `docs/agents/moreskant-app.md` → "Streaming Početna's second
// half" for the shape and its rules.
//
// **The shared reads are memoised with React's `cache`**, which is what keeps
// the per-card shape from turning one query into four. Three cards want the
// public schedule and two want the roster's; `cache` dedupes them within one
// request, so a card costs a query only the first time anybody asks for it.
// Nothing is cached ACROSS requests: these are per-render memos, not a data
// cache, which is the whole reason they are safe on a screen that prints the
// door's live progress.
//
// **It asks only for the cards it is going to draw.** A `partner` login never
// touches the orders table and a blagajna login never loads the roster: a card
// nobody is drawing is never loaded, because the loading IS the drawing now.
// That is also why nothing here is a "dashboard query" — every figure comes
// from the loader its own screen already uses (`countNewInquiries`,
// `loadDoorShow`, `loadSellScreen`, `loadFinanceScreen`, `getSeasonStats`,
// `loadRoster`, `loadAccounts`), so a number on Početna and the same number one
// tap away cannot disagree.
//
// Data reaches the database through `getRepo()` or through `src/lib/shows.ts`,
// the two sanctioned entry points; this file imports no Payload and needs no
// entry in the repo guard's allow-list.

import { cache } from 'react'
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
import { pickHeroPerformances, type RosterPerformance } from './roster-loaders'
import { armyLabel, heroView, type HeroView } from './moreska-screen'
import { kindsOf, myStanding, rankDancers } from './leaderboard-rank'
import { formatEur } from './orders-view'
import { APP_STRINGS } from './strings'
import {
  compCard,
  financeCard,
  greetingLine,
  homeCardPlan,
  inboxCard,
  inquiriesCard,
  leaderboardCard,
  membersCard,
  moreskaCard,
  moreskaEmptyCard,
  nextSentence,
  ownAccessPrompt,
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
  type HomeCardable,
  type OwnAccessPrompt,
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
  /**
   * "Postavi e-mail i lozinku", or null once the reader owns their way in
   * (#651, ADR-0028).
   *
   * No query of its own: the answer is the account row the viewer already
   * carries, so the card is gone on the first render after the form saves.
   */
  ownAccess: OwnAccessPrompt | null
  /** The tab screens' cards, at full weight. Awaited before anything paints. */
  cards: HomeCard[]
  /**
   * The rest, as KEYS rather than as cards: the page gives each one its own
   * `<Suspense>` and calls {@link loadHomeCard} inside it, so one slow screen
   * delays only its own tile (#627).
   */
  secondary: HomeCardable[]
  /**
   * The screen's ONE clock, handed to every streamed card (#627).
   *
   * The greeting, the sentence and "karata za sutra" have to agree, and a
   * streamed tile that read `Date.now()` for itself could land on the other
   * side of midnight from the sentence above it — a second or two later, on a
   * phone opened at 23:59:59.
   */
  nowMs: number
}

/** The next public evening, as the two cards that need one read it. */
interface NextPublic {
  id: string
  date: string
  sold: number
  capacity: number
}

// ── The shared reads, memoised for one request ─────────────────────────────

/** The public schedule: three cards' input, and the selling register's sentence. */
const upcomingShows = cache(() => getUpcomingShows())

/** The next public evening, as a house rather than as a show row. */
const nextPublic = cache(async (): Promise<NextPublic | null> => {
  const shows = await upcomingShows()
  const show = shows[0]
  if (!show) return null
  return {
    id: show.id,
    date: show.date,
    capacity: VENUE_CAPACITY[show.venue],
    // `remaining` is capacity minus every seat that is gone, ledger seats
    // included, so the sold figure is its complement rather than a fourth way
    // to count a house.
    sold: Math.max(0, VENUE_CAPACITY[show.venue] - show.remaining),
  }
})

/**
 * The roster's own schedule: every evening a dancer has to turn up for, public
 * or not (ADR-0024). One read serves the sentence and the Moreška hero.
 *
 * `armyCounts` is a parameter of the memo rather than a flag on the caller, so
 * the hero's headcount query is paid for once and only when the hero is drawn.
 */
const seasonFor = cache((memberId: string | null, voditelj: boolean, armyCounts: boolean) =>
  getSeasonPerformances({ memberId, voditelj, armyCounts }),
)

const doorShow = cache(() => loadDoorShow())
const rosterRows = cache(() => loadRoster())
const pendingClaims = cache(() => getPendingJoinClaims())

// ── One card ───────────────────────────────────────────────────────────────

/**
 * One card, and everything it needs.
 *
 * Every branch is the whole of that card's IO, which is what makes a
 * `<Suspense>` boundary around it honest: nothing outside the branch is waited
 * for, so a tile appears exactly when its own screen's loader answers.
 *
 * Returns null for a key with no card of its own. Početna is a set of glances,
 * not a mirror of the permission table, and a tab is still how you reach a
 * screen that has nothing to glance at.
 */
export async function loadHomeCard(
  viewer: AppViewer,
  key: HomeCardable,
  nowMs: number,
): Promise<HomeCard> {
  const today = zagrebToday(nowMs)

  switch (key) {
    case 'moreska': {
      // The TILE, never the hero: the hero is loaded with the primary half and
      // is `HomeScreen.moreska`. This branch runs only for an account that
      // unlocks Moreška without carrying it as a tab.
      const season = await seasonFor(viewer.me?.id ?? null, viewer.voditelj, false)
      return season.upcoming.length > 0
        ? moreskaCard(season.upcoming.length)
        : moreskaEmptyCard(season.past.length > 0)
    }
    case 'orders': {
      const next = await nextPublic()
      return ordersCard({
        count: await countOrders(next?.id ?? null),
        forNextShow: next !== null,
      })
    }
    case 'inquiries':
      return inquiriesCard(await countNewInquiries())
    case 'performances':
      return performancesCard((await upcomingShows()).length)
    case 'members': {
      const [rows, pending] = await Promise.all([rosterRows(), pendingClaims()])
      return membersCard({
        active: rows.members.filter((m) => m.active).length,
        pending: pending.length,
      })
    }
    case 'users':
      return usersCard((await loadAccounts()).length)
    case 'comp': {
      const tickets = await getRepo().comp.ticketsInSeason(seasonYear(new Date(nowMs)))
      return compCard(tickets.filter((t) => !t.cancelled).length)
    }
    case 'sell': {
      const sell = await loadSellScreen(
        viewer.access.kind === 'ok' ? viewer.access.partnerId : null,
      )
      return sellCard({
        ticketsSold: sell?.month.ticketsSold ?? 0,
        monthLabel: sell?.monthLabel ?? '',
      })
    }
    case 'statement':
      return statementCard()
    case 'scan':
      return scanCard((await doorShow())?.progress ?? null)
    case 'finance': {
      // The one euro figure on this screen, and it is already a string by the
      // time it leaves this file: `home-screen.ts` knows nothing about cents.
      const finance = await loadFinanceScreen({})
      return financeCard(formatEur(finance.money.collectedCents))
    }
    case 'stats': {
      const next = await nextPublic()
      return statsCard(next ? { ...next, today } : null)
    }
    case 'leaderboard': {
      // The MOREŠKA list, not the whole season (#568): the card's podium and
      // its "ti si N." have to be the ones the reader finds when they tap it,
      // and the screen opens on that list. A season ranked one way on the card
      // and another on the screen would be the same mistake as two
      // aggregations of one season.
      const board = await getSeasonStats(undefined)
      const ranked = rankDancers({
        rows: board.rows,
        kind: 'moreska',
        myMemberId: viewer.me?.id ?? null,
        confirmed: kindsOf('moreska').reduce((sum, k) => sum + board.confirmedByKind[k], 0),
      })
      return leaderboardCard({
        top: ranked.slice(0, 3),
        me: myStanding(ranked),
        // Ljestvica answers to `moreskant` and `moreska` and to nobody else, so
        // its count is in the dancer's register: "1. s 11 nastupa", never
        // "izvedbi" (CONTEXT.md, two registers). The INSTRUMENTAL of it,
        // because the sentence is "s …" (#568): the nominative read "ti si 4. s
        // 1 nastup".
        countWords: APP_STRINGS.board.withCount,
      })
    }
    case 'notifications': {
      const inbox = await getMyNotifications(viewer.userId)
      const latest = inbox.rows[0] ?? null
      return inboxCard({
        latest: latest ? { title: latest.title, body: latest.body } : null,
        unread: viewer.unreadNotifications,
      })
    }
  }
}

// ── The screen ─────────────────────────────────────────────────────────────

export async function loadHomeScreen(viewer: AppViewer): Promise<HomeScreen> {
  const plan = homeCardPlan(viewer.nav)

  // One clock for the whole screen, read here rather than in a component: the
  // greeting, the sentence and "karata za sutra" all have to agree, and a
  // render that read `Date.now()` for itself is both impure and a chance for
  // two of them to land on different sides of midnight.
  const nowMs = Date.now()
  const today = zagrebToday(nowMs)
  const register = registerFor(viewer.permissions)

  const heroWanted = plan.primary.includes('moreska')

  const [season, next, cards] = await Promise.all([
    heroWanted || register === 'nastup'
      ? // The hero draws the ArmyBar for a dancer too (#565): "are we enough
        // tonight" is a question the whole roster reads. Asked for only when the
        // hero is going to be drawn, so a dancer whose bar has no Moreška tab
        // does not pay for two headcount queries.
        seasonFor(viewer.me?.id ?? null, viewer.voditelj, heroWanted)
      : Promise.resolve(null),
    register === 'izvedba' ? nextPublic() : Promise.resolve(null),
    // The primary half in parallel, each card loading only its own inputs.
    Promise.all(plan.primary.map((key) => loadHomeCard(viewer, key, nowMs))),
  ])

  // The hero is the DAY rather than one evening (#591): two nastupa on the same
  // Zagreb day split it into halves, and Početna and Moreška split it the same
  // way because they read the same function.
  const heroPick = pickHeroPerformances(season?.upcoming ?? [])
  const nextNastup = heroPick?.first ?? null
  const moreska: MoreskaHero | null =
    heroWanted && heroPick && nextNastup
      ? {
          // The screen's one clock, again: "DANAS" on the card has to agree
          // with the sentence above it, and both read this `today` (#612).
          hero: heroView(heroPick, { today }),
          performanceId: nextNastup.id,
          memberId: viewer.me?.id ?? null,
          answer: nextNastup.myAnswer,
          army: armyLabel(nextNastup.myArmy),
          canAnswer: nextNastup.canAnswer,
        }
      : null

  return {
    moreska,
    // A reader with no address of their own is asked for one, once, on the one
    // screen that is not about a job. It is never blocking: the card sits under
    // the reader's own work and a dancer who came to read tonight's postava
    // walks past it.
    ownAccess: ownAccessPrompt({
      hasEmail: viewer.email != null,
      hasOwnPassword: viewer.hasOwnPassword,
      shared: viewer.shared,
      // Who the card is FOR, and not only what it asks (#664): a staff login
      // manages its credentials in Korisnici and the Backoffice.
      permissions: viewer.permissions,
    }),
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
    // The Moreška hero replaces its own tile, so a primary `moreska` card is
    // drawn only when there is no evening left to be the hero of.
    cards: cards.filter((card) => !(card.key === 'moreska' && moreska != null)),
    secondary: plan.secondary,
    nowMs,
  }
}
