// What Početna says, as pure functions over what the other screens already
// load (#564, decisions Q16, Q26, Q59, Q61).
//
// `/app` stopped redirecting and became a screen. It is the one surface in
// Cecilija that is not about a job: it is the reader's own front door, so it
// says who they are, when the next evening is, and then hands them one card per
// screen their bar carries. Four cards at most, and a card whose screen this
// account does not unlock is never built — which is the whole of the rule,
// because the bar is already the permission table's answer (`screens.ts`) and
// nothing here re-derives it.
//
// Three rules live here rather than in the page:
//
//   1. **The greeting names the reader and nothing else** — no vocative
//      ("Dobra večer, Josip.", never "Josipe"). The roster is full of names
//      whose vocative nobody agrees on, and an account with no name to use (a
//      shared login, ADR-0022) gets no greeting rather than one addressed to
//      nobody. The username is never a name: `tehnika` is a room, not a person.
//   2. **The second sentence is in the reader's own register** (CONTEXT.md, two
//      registers): a moreškant or a voditelj reads "nastup", everybody else
//      reads "izvedba" about the same evening.
//   3. **No money on this screen except Financije's one figure**, and no buyer
//      ever. Every other card counts things.
//
// No IO, no Payload and no clock of its own: `home-data.ts` hands the wall
// clock in with the rows, so the same instant decides the greeting and the
// "danas". `home-screen.test.ts` is where the rules are asserted.

import type { Permission } from '@/lib/access/permissions'
import { screenByKey, type AppNav, type AppScreenKey } from './screens'
import { APP_STRINGS, dayAndMonth, weekdayAfterU } from './strings'
import { pluralForm } from './roster-loaders'

const S = APP_STRINGS.landing

/** The four cards, and the one that is not a screen. */
export type HomeCardKey = AppScreenKey | 'notifications'

/**
 * How many cards Početna carries (Q26).
 *
 * Three chosen tabs plus Obavijesti is exactly four, so the cap is the bar's
 * cap restated rather than a second opinion — but it is stated, because a
 * screen that grew a fifth card by accident is how a landing page becomes a
 * dashboard nobody reads.
 */
export const MAX_HOME_CARDS = 4

/**
 * One card per tab, in the account's own tab order, then Obavijesti.
 *
 * Početna and Više are dropped: a card back to the screen you are on says
 * nothing, and Više is a menu rather than a place. Everything else comes
 * straight off `nav.tabs`, so a `users` holder rearranging somebody's bar
 * rearranges their Početna with it and there is no second list to keep in step.
 */
export function homeCardKeys(nav: AppNav): HomeCardKey[] {
  const screens = nav.tabs
    .map((tab) => tab.key)
    .filter((key): key is AppScreenKey => key !== 'home' && key !== 'more')
  return [...screens, 'notifications' as const].slice(0, MAX_HOME_CARDS)
}

// ── The greeting ───────────────────────────────────────────────────────────

export type DayPart = 'morning' | 'afternoon' | 'evening'

const ZAGREB_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zagreb',
  hour: '2-digit',
  hour12: false,
})

/** The Zagreb wall-clock hour of an instant, 0..23. */
export function zagrebHour(nowMs: number): number {
  const raw = Number(ZAGREB_HOUR.format(nowMs))
  if (!Number.isFinite(raw)) return 12
  // `en-GB` renders midnight as "24" in some ICU versions.
  return raw === 24 ? 0 : raw
}

const ZAGREB_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zagreb',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today in Korčula, as YYYY-MM-DD. The server is in Nuremberg; Zagreb decides. */
export function zagrebToday(nowMs: number): string {
  return ZAGREB_DAY.format(nowMs)
}

/**
 * Morning until 10, afternoon until 18, evening after.
 *
 * The evening boundary is the one that matters: the moreška is danced at 21:00
 * and a dancer opening the app on the way to it should not be told "dobar dan".
 */
export function dayPart(hour: number): DayPart {
  if (hour < 10) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/**
 * The first name to greet, or null when there is none to use.
 *
 * The linked Member's name first (that is the person's own legal name on the
 * roster), then the account's `name` (#510: whom the login belongs to, empty on
 * a shared one). **Never the username**: a shared login is `tehnika` or
 * `member`, and "Dobra večer, tehnika." is the app talking to a cupboard.
 */
export function firstNameOf(input: {
  memberName?: string | null
  accountName?: string | null
}): string | null {
  const full = (input.memberName ?? '').trim() || (input.accountName ?? '').trim()
  if (full === '') return null
  return full.split(/\s+/)[0] ?? null
}

/** "Dobra večer, Josip." — or null for an account with no name of its own. */
export function greetingLine(input: { nowMs: number; firstName: string | null }): string | null {
  if (!input.firstName) return null
  return S.greeting(S[dayPart(zagrebHour(input.nowMs))], input.firstName)
}

// ── The sentence about the next evening ────────────────────────────────────

/** Which of the two words this reader's screens use (CONTEXT.md). */
export type Register = 'nastup' | 'izvedba'

/**
 * The dancer's register for anybody on the roster, the selling one for
 * everybody else.
 *
 * A voditelj reads "nastup" even when they also hold `tickets`, which is the
 * same precedence the generic bar uses (dancer → box, #563): the half only they
 * can do comes first.
 */
export function registerFor(permissions: readonly Permission[]): Register {
  return permissions.includes('moreskant') || permissions.includes('moreska')
    ? 'nastup'
    : 'izvedba'
}

/** Whole days from today to a YYYY-MM-DD date, both read as calendar days. */
export function daysBetween(today: string, date: string): number | null {
  const a = Date.parse(`${today}T12:00:00.000Z`)
  const b = Date.parse(`${date}T12:00:00.000Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * "Sutra je nastup." — one sentence about the next evening, or null when there
 * is none in the schedule.
 *
 * Today and tomorrow get a word; the rest of this week gets its weekday, in the
 * accusative Croatian puts after "u"; anything further out gets a date, because
 * "u petak" a fortnight away names the wrong Friday.
 */
export function nextSentence(input: {
  /** The next evening's day, YYYY-MM-DD, or null when there is none. */
  date: string | null
  /** Today in Zagreb, YYYY-MM-DD. */
  today: string
  register: Register
}): string | null {
  if (!input.date) return null
  const words = S.next[input.register]
  const days = daysBetween(input.today, input.date)
  if (days === null) return null
  // An evening earlier today is still today's: the door show keeps its day
  // until the grace window closes, and the loader is the one that decides that.
  if (days <= 0) return words.today
  if (days === 1) return words.tomorrow
  if (days <= 6) return words.onDay(weekdayAfterU(input.date))
  return words.onDate(dayAndMonth(input.date))
}

// ── The cards ──────────────────────────────────────────────────────────────

export interface CardChip {
  label: string
  tone: 'gold' | 'warn'
}

interface CardBase {
  /** The small uppercase line: the screen this card is about. */
  eyebrow: string
  /** Where the one action goes. */
  href: string
  /** What the one action is called, in the case the verb asks for. */
  action: string
}

/** A number and what it means. Nine of the twelve screens are one of these. */
export interface FigureCard extends CardBase {
  kind: 'figure'
  key: HomeCardKey
  /** Null for the two screens whose only number would be money or a repeat. */
  figure: string | null
  caption: string
  chip?: CardChip
}

/** The house filling up: an arc, not a percentage anybody has to read. */
export interface RingCard extends CardBase {
  kind: 'ring'
  key: 'stats'
  ring: { value: number; max: number } | null
  caption: string
}

/** The top three of the season, and where the reader stands. */
export interface PodiumCard extends CardBase {
  kind: 'podium'
  key: 'leaderboard'
  entries: { label: string; value: number }[]
  caption: string
}

/** The last thing that happened, and how many are unread. */
export interface InboxCard extends CardBase {
  kind: 'inbox'
  key: 'notifications'
  title: string | null
  body: string | null
  unread: number
}

export type HomeCard = FigureCard | RingCard | PodiumCard | InboxCard

/** The inbox is a Više row rather than a screen, so it has no table entry. */
const NOTIFICATIONS_ROUTE = '/app/notifications'

/**
 * A card's name and its one link, read off the screen table itself.
 *
 * Never a list of routes or labels of its own: `screens.ts` is the single
 * source (CLAUDE.md), so a screen that is renamed or re-routed moves its card
 * with it and no second table can drift.
 */
function base(key: Exclude<HomeCardKey, 'home' | 'more'>): CardBase {
  const screen = key === 'notifications' ? null : screenByKey(key)
  return {
    eyebrow: screen ? screen.label : S.notifications,
    href: screen ? screen.route : NOTIFICATIONS_ROUTE,
    action: S.open[key],
  }
}

/** `${count} ${the noun in the form that count takes}`, split in two. */
function counted(
  count: number,
  words: { one: string; few: string; many: string },
): { figure: string; caption: string } {
  return { figure: String(count), caption: words[pluralForm(count)] }
}

/**
 * Narudžbe: how many orders the next evening has, or how many there are in all
 * when the schedule is empty. The caption says which question was answered, so
 * the figure can never be read as the other one.
 */
export function ordersCard(input: { count: number; forNextShow: boolean }): FigureCard {
  const { figure, caption } = counted(
    input.count,
    input.forNextShow ? S.captions.orders : S.captions.ordersAll,
  )
  return { kind: 'figure', key: 'orders', ...base('orders'), figure, caption }
}

/** Upiti: the one number the inbox has, which is how many nobody has answered. */
export function inquiriesCard(count: number): FigureCard {
  const { figure, caption } = counted(count, S.captions.inquiries)
  return {
    kind: 'figure',
    key: 'inquiries',
    ...base('inquiries'),
    figure,
    caption,
  }
}

/** Izvedbe: what is still in the schedule. */
export function performancesCard(upcoming: number): FigureCard {
  const { figure, caption } = counted(upcoming, S.captions.performances)
  return {
    kind: 'figure',
    key: 'performances',
    ...base('performances'),
    figure,
    caption,
  }
}

/**
 * Članovi: the roster, plus the queue when somebody is standing in it.
 *
 * The pending claims are a CHIP rather than the figure: the roster is what the
 * screen is, and a voditelj with nobody waiting should not read a zero as the
 * screen's headline.
 */
export function membersCard(input: { active: number; pending: number }): FigureCard {
  const { figure, caption } = counted(input.active, S.captions.members)
  return {
    kind: 'figure',
    key: 'members',
    ...base('members'),
    figure,
    caption,
    ...(input.pending > 0
      ? { chip: { label: S.pending(input.pending), tone: 'gold' as const } }
      : {}),
  }
}

/**
 * Moreška, when there is no nastup left to be the hero of.
 *
 * The season is over or has not started, and the card says which — the same two
 * pieces of news the Moreška screen itself distinguishes (#565), because "sezona
 * je završila" and "sezona još nije počela" are not the same sentence to
 * somebody looking for their next evening.
 */
export function moreskaEmptyCard(hasPast: boolean): FigureCard {
  return {
    kind: 'figure',
    key: 'moreska',
    ...base('moreska'),
    figure: null,
    caption: hasPast ? APP_STRINGS.moreska.eosTitle : APP_STRINGS.moreska.eosNothingTitle,
  }
}

/** Korisnici: how many logins there are. */
export function usersCard(count: number): FigureCard {
  const { figure, caption } = counted(count, S.captions.users)
  return { kind: 'figure', key: 'users', ...base('users'), figure, caption }
}

/** Gratis: how many free seats the society handed out this season. */
export function compCard(count: number | null): FigureCard {
  if (count === null) {
    return {
      kind: 'figure',
      key: 'comp',
      ...base('comp'),
      figure: null,
      caption: S.captions.compPlain,
    }
  }
  const { figure, caption } = counted(count, S.captions.comp)
  return { kind: 'figure', key: 'comp', ...base('comp'), figure, caption }
}

/** Prodaja: the reseller's month, in seats. The euros are on the screen itself. */
export function sellCard(input: { ticketsSold: number; monthLabel: string }): FigureCard {
  const { figure, caption } = counted(input.ticketsSold, S.captions.sell)
  return {
    kind: 'figure',
    key: 'sell',
    ...base('sell'),
    figure,
    caption: S.captions.sellMonth(caption, input.monthLabel),
  }
}

/**
 * Obračun: no figure, on purpose.
 *
 * Its one number is what a reseller owes, and money on Početna is Financije's
 * alone. Repeating Prodaja's seat count here would be two cards saying one
 * thing, so this card is the sentence and the way in.
 */
export function statementCard(): FigureCard {
  return {
    kind: 'figure',
    key: 'statement',
    ...base('statement'),
    figure: null,
    caption: S.captions.statement,
  }
}

/** Skener: "212 od 260 ušlo", or the empty evening. */
export function scanCard(progress: { admitted: number; sold: number } | null): FigureCard {
  if (!progress) {
    return {
      kind: 'figure',
      key: 'scan',
      ...base('scan'),
      figure: null,
      caption: S.noShow,
    }
  }
  return {
    kind: 'figure',
    key: 'scan',
    ...base('scan'),
    figure: String(progress.admitted),
    caption: S.captions.scan(progress.sold),
  }
}

/**
 * Financije: the one euro figure Početna carries, and only for a `finance`
 * holder, because only a `finance` holder has Financije in their bar at all.
 *
 * The amount arrives already formatted: this module knows nothing about cents,
 * so no template here can print a raw one.
 */
export function financeCard(collected: string): FigureCard {
  return {
    kind: 'figure',
    key: 'finance',
    ...base('finance'),
    figure: collected,
    caption: S.captions.finance,
  }
}

/**
 * Statistika: the next public evening filling up, as a ring.
 *
 * `when` is "danas", "sutra" or a date, which is how the prototype reads it:
 * "212 karata za sutra, od 350".
 */
export function statsCard(
  next: { sold: number; capacity: number; date: string; today: string } | null,
): RingCard {
  if (!next) {
    return { kind: 'ring', key: 'stats', ...base('stats'), ring: null, caption: S.noShow }
  }
  const days = daysBetween(next.today, next.date)
  const when =
    days === null || days > 1
      ? dayAndMonth(next.date)
      : days <= 0
        ? APP_STRINGS.home.today
        : APP_STRINGS.home.tomorrow
  return {
    kind: 'ring',
    key: 'stats',
    ...base('stats'),
    ring: { value: next.sold, max: next.capacity },
    caption: S.captions.stats(when, next.capacity),
  }
}

/**
 * Ljestvica: the top three, and one line about the reader.
 *
 * A reader with a row of their own reads their own place; a voditelj who does
 * not dance has none, so the line names whoever is leading instead of inventing
 * a rank for somebody who is not on the board.
 */
export function leaderboardCard(input: {
  top: { nickname: string; performances: number }[]
  me: { rank: number; performances: number } | null
  countWords: { one: string; few: string; many: string }
}): PodiumCard {
  const entries = input.top
    .slice(0, 3)
    .map((row) => ({ label: row.nickname, value: row.performances }))
  const leader = input.top[0]
  const counted = (n: number) => `${n} ${input.countWords[pluralForm(n)]}`

  const caption = input.me
    ? S.myPlace(input.me.rank, counted(input.me.performances))
    : leader
      ? S.leading(leader.nickname, counted(leader.performances))
      : S.noSeason

  return {
    kind: 'podium',
    key: 'leaderboard',
    ...base('leaderboard'),
    entries,
    caption,
  }
}

/** Obavijesti: the last thing that happened, and how many are unread. */
export function inboxCard(input: {
  latest: { title: string; body: string } | null
  unread: number
}): InboxCard {
  return {
    kind: 'inbox',
    key: 'notifications',
    ...base('notifications'),
    title: input.latest?.title ?? null,
    body: input.latest?.body ?? null,
    unread: input.unread,
  }
}
