// What Početna says, as pure functions over what the other screens already
// load (#564, decisions Q16, Q26, Q59, Q61).
//
// `/app` stopped redirecting and became a screen. It is the one surface in
// Cecilija that is not about a job: it is the reader's own front door, so it
// says who they are, when the next evening is, and then hands them one card per
// screen THEY UNLOCK — not per tab. A card whose screen this account does not
// unlock is never built, which is the whole of the rule, because the set of
// unlocked screens is already the permission table's answer (`screens.ts`) and
// nothing here re-derives it.
//
// **Two weights, not a cap** (#627, Q23-Q26). It was four cards at most until
// this ticket, on the grounds that a fifth is how a landing page becomes a
// dashboard nobody reads — and that is still true of a flat list of thirteen.
// So the list is not flat: the three tabs keep their rings, their podium and
// their large figures, and everything else is a short two-up tile carrying the
// screen's name and one number. A reader still has a top to read in a glance;
// they simply also have the rest of their app under it.
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

import { isDancerLogin, type Permission } from '@/lib/access/permissions'
import { ownsTheirAccess } from './member-marks'
import { screenByKey, type AppNav, type AppScreenKey } from './screens'
import { APP_STRINGS, dayAndMonth, weekdayAfterU } from './strings'
import { pluralForm } from './roster-loaders'

const S = APP_STRINGS.landing

/** Every card, and the one that is not a screen. */
export type HomeCardKey = AppScreenKey | 'notifications'

/**
 * A key that actually gets a card.
 *
 * Početna is this screen and Više is a menu, so neither is ever drawn. Stating
 * it as a TYPE rather than as a runtime check is what lets `loadHomeCard`
 * return a card rather than `HomeCard | null`: a tile that could turn out to be
 * nothing is a tile that can appear as a placeholder and then vanish, which is
 * the one thing a streamed second half must not do.
 */
export type HomeCardable = Exclude<HomeCardKey, 'home' | 'more'>

/** Which cards Početna draws, and at which of the two weights (#627). */
export interface HomeCardPlan {
  /**
   * The tab screens, in the account's own order. Drawn at full weight, and the
   * only half the page WAITS for.
   */
  primary: HomeCardable[]
  /**
   * Obavijesti, then every other screen the account unlocks, in the order Više
   * groups them. Drawn short and two to a row, and streamed in behind the
   * primary half.
   */
  secondary: HomeCardable[]
}

/** Početna and Više never get a card: one is this screen and the other a menu. */
const cardable = (key: AppScreenKey): key is HomeCardable & AppScreenKey =>
  key !== 'home' && key !== 'more'

/**
 * The plan, off `nav` and off nothing else.
 *
 * The primary half is `nav.tabs`, so a `users` holder rearranging somebody's
 * bar rearranges their Početna with it. The secondary half is every OTHER
 * unlocked screen in `nav.groups` order — the same Moreškant · Blagajna ·
 * Partner · Vrata · Uprava division Više draws, minus its headings, because a
 * heading over two tiles is a section that says less than the tiles do.
 *
 * Obavijesti opens the second half: it is the only card whose content is a
 * sentence somebody wrote, so it reads as the hinge between "your screens" and
 * "everything else" rather than as one more number.
 */
export function homeCardPlan(nav: AppNav): HomeCardPlan {
  const primary = nav.tabs.map((tab) => tab.key).filter(cardable)
  const taken = new Set<AppScreenKey>(primary)
  const secondary: HomeCardable[] = ['notifications']
  for (const group of nav.groups) {
    for (const screen of group.screens) {
      if (!cardable(screen.key) || taken.has(screen.key)) continue
      taken.add(screen.key)
      secondary.push(screen.key)
    }
  }
  // `nav.groups` is built from the same unlocked set as `nav.overflow`, so this
  // catches nothing today. It is here because the two are built by different
  // rules, and a screen silently missing from Početna is the kind of bug that
  // is only ever noticed by the one person who holds that permission.
  for (const screen of nav.overflow) {
    if (!cardable(screen.key) || taken.has(screen.key)) continue
    taken.add(screen.key)
    secondary.push(screen.key)
  }
  return { primary, secondary }
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
 * The small hours are still the evening, then morning until 10, afternoon until
 * 18, evening after.
 *
 * The evening boundary at 18 is the one that matters most: the moreška is
 * danced at 21:00 and a dancer opening the app on the way to it should not be
 * told "dobar dan". The one at 4 is the same thought running the other way — a
 * dancer opening the app at 01:00 on the way home from a nastup is still having
 * tonight, and "dobro jutro" would be the app insisting otherwise.
 */
export function dayPart(hour: number): DayPart {
  if (hour < 4) return 'evening'
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

/**
 * "Dobra večer, Josip." — the time of day, and the reader's name when there is
 * one to use.
 *
 * A SHARED login gets nothing at all (ADR-0022): `tehnika` is a phone on a wall
 * by the gate and `member` is the society, and a greeting is addressed to a
 * person. A named account with no `name` filled in still gets the time of day,
 * which is true of everybody, rather than a blank where a sentence should be.
 */
export function greetingLine(input: {
  nowMs: number
  firstName: string | null
  shared?: boolean
}): string | null {
  if (input.shared) return null
  const part = S[dayPart(zagrebHour(input.nowMs))]
  return input.firstName ? S.greeting(part, input.firstName) : `${part}.`
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

// ── The one thing Početna asks for ─────────────────────────────────────────

/** The card that asks a reader to take their own way in (#651, ADR-0028). */
export interface OwnAccessPrompt {
  title: string
  body: string
  action: string
  href: string
}

/**
 * "Postavi e-mail i lozinku", or nothing at all.
 *
 * The one prompt on a screen that is otherwise all figures, and the only thing
 * on it that asks rather than reports. It exists because a dancer signed in by
 * a voditelj's link holds no key of their own: no address means "Zaboravljena
 * lozinka" has nowhere to send anything, and no password means a second phone
 * has nothing to type.
 *
 * **The card goes when BOTH halves are there**, which is the same predicate the
 * *Pristup* mark on Članovi applies (`ownsTheirAccess`) and deliberately the same
 * function rather than a second copy of it. Reading only the address was the
 * version that shipped first, and it took the card away from exactly the dancer
 * who still could not sign in on a second phone: they had typed an address and
 * were still carrying the random password their invitation minted. The form
 * behind the card writes both, so a reader who completes it loses the card on
 * the same render.
 *
 * **Never blocking, and never for a shared login.** `/app/welcome` gains no
 * fourth step for this (the Dobrodošlica is remembered per DEVICE and this is
 * per account, so a fourth step would re-ask somebody on every new phone), and
 * `tehnika` is a room rather than a person, so it has no address to own.
 *
 * **And only for a DANCER's login** (#664). ADR-0028 is about the person whose
 * only way in is an invitation; a `users`, `tickets` or `finance` holder chose
 * their password in the Backoffice and manages credentials in Korisnici, so the
 * card is nonsense on their screen — which is what shipped, because the first
 * version guarded on the credentials and never on the audience, and told the
 * one account holding all eleven permissions to go and set a password it has
 * had since May. The test is `isDancerLogin`, the same predicate that decides
 * where an invitation may land, because it is the same population; "links a
 * Member" is NOT the test, since #462 links a voditelj's own Member to their
 * staff login.
 *
 * `hasOwnPassword` is false for "we do not know" as much as for "there is
 * none" — `users.password_set_at` cannot tell them apart (`readPasswordStamp`)
 * — so the card may ask a dancer who already chose one. That costs a minute
 * and is accepted; for everybody else the audience check above is what makes
 * the same unknown harmless.
 */
export function ownAccessPrompt(input: {
  hasEmail: boolean
  hasOwnPassword: boolean
  shared?: boolean
  /** The reader's permission set, raw, for the audience check. */
  permissions: readonly unknown[] | null
}): OwnAccessPrompt | null {
  if (input.shared === true || ownsTheirAccess(input)) return null
  if (!isDancerLogin({ permissions: input.permissions })) return null
  const words = APP_STRINGS.ownAccess.card
  return {
    title: words.title,
    body: words.body,
    action: words.action,
    // The anchor rather than the bare screen: the fields are the fourth section
    // of Profil, and a reader who tapped "Postavi sada" should land on them.
    href: '/app/account#security',
  }
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
  /**
   * The top three, in finishing order.
   *
   * `me` is the reader's own step (#612). The tile's three bars were three
   * anonymous blocks: a dancer who IS on the podium had to read three nicknames
   * to find out, on a card whose whole job is to be read in a glance. The flag
   * is decided here, off the ranked rows, rather than by comparing nicknames in
   * a component — two moreškanti can share one.
   */
  entries: { label: string; value: number; me: boolean }[]
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
function base(key: HomeCardable): CardBase {
  const screen = key === 'notifications' ? null : screenByKey(key)
  return {
    eyebrow: screen ? screen.label : S.notifications,
    href: screen ? screen.route : NOTIFICATIONS_ROUTE,
    action: S.open[key],
  }
}

/**
 * A card's name, known WITHOUT loading it (#627).
 *
 * The placeholder a streaming tile shows while its screen answers needs the
 * name and nothing else, and reading it off `base` here is what stops the page
 * from re-typing the "notifications" special case beside the screen table.
 */
export function homeCardLabel(key: HomeCardable): string {
  return base(key).eyebrow
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
/**
 * Moreška as a TILE rather than as the hero (#627).
 *
 * Only ever drawn when the account unlocks Moreška but does not carry it as a
 * tab: the hero is the primary half's, a screen has one hero or none (T1), and
 * a dancer whose bar was arranged around Blagajna still deserves to see how
 * many evenings are left.
 */
export function moreskaCard(upcoming: number): FigureCard {
  const { figure, caption } = counted(upcoming, S.captions.moreska)
  return { kind: 'figure', key: 'moreska', ...base('moreska'), figure, caption }
}

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
  top: { nickname: string; performances: number; me?: boolean }[]
  me: { rank: number; performances: number } | null
  countWords: { one: string; few: string; many: string }
}): PodiumCard {
  const entries = input.top
    .slice(0, 3)
    .map((row) => ({ label: row.nickname, value: row.performances, me: row.me === true }))
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
