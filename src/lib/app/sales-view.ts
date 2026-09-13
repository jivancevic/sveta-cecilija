// What a public evening has sold, and how Izvedbe says it (#502, ADR-0025).
//
// The blagajna's half of the performance screen is a handful of numbers, and
// every one of them already has a home somewhere in this codebase. This module
// is where they are ASSEMBLED and WORDED, never where they are re-derived:
//
//   - capacity is `VENUE_CAPACITY[venue]` and nothing else — there is no
//     `capacity` column and never will be (CLAUDE.md);
//   - remaining is `remainingSeats` from `tickets/seat-availability.ts`, the
//     same function the sell lock refuses a sale with;
//   - the three ticketed channels come from
//     `getActiveTicketCountsByShowAndChannel` (`tickets/sold-seats.ts`), and
//     the two artefact-less ones from the offline ledger's own totals
//     (`offline-sales/data.ts`). Money and the adult/child split read the
//     ledger, capacity reads the cached counters: that is ADR-0025's rule and
//     `sales-data.ts` honours it.
//
// `computeShowStats` (the old `/admin/stats/[id]` drill-down) is deliberately
// NOT reused: it folds partner seats into `onlineSold`, and the split this
// screen is asked for names partner separately. The counting it does — one
// active ticket is one seat, a comp is a seat and never money — is the same
// counting done here, from the same two loaders.
//
// Pure: no IO, no clock, no Payload. `sales-data.ts` is the wiring.

import { formatEur } from './orders-view'
import { remainingSeats } from '@/lib/tickets/seat-availability'
import type { OfflineSaleErrorCode } from '@/lib/offline-sales/lines'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'
import { APP_STRINGS } from './strings'

const S = APP_STRINGS.sales

/**
 * One public performance's sales, as the screen reads them.
 *
 * The five seat counts are kept apart rather than summed into one field: the
 * question the blagajna asks a row is "where did these hundred and thirty two
 * seats come from", and a total answers it only after the split does.
 */
export interface PerformanceSales {
  showId: string
  venue: Venue
  /** Active tickets on `channel='online'` (a promo order is still online). */
  online: number
  /** Active tickets on `channel='partner'` (ADR-0008). */
  partner: number
  /** Active tickets on `channel='comp'`: a seat, never a sale (ADR-0019). */
  comp: number
  /** Ledger seats sold at the entrance (ADR-0025, `source='door'`). */
  door: number
  /** Ledger seats held over from the old WordPress site (`source='legacy'`). */
  legacy: number
  /** People through the door: scanned ACTIVE tickets, one per person. */
  scanned: number
  /** Non-refunded order totals, in cents. Comps are €0 and add nothing. */
  ticketRevenueCents: number
  /** What the offline ledger says was actually charged, in cents. */
  offlineRevenueCents: number
  /** `shows.onlineSalesPaused` (#366): online checkout is off for this row. */
  paused: boolean
  cancelled: boolean
  /** `venue_changed_at` is set: this evening was moved indoors (#94). */
  moved: boolean
  /** `date_changed_at` is set: this evening was rescheduled (#379). */
  rescheduled: boolean
}

/**
 * Whether the ROSTER half of Izvedbe belongs on this viewer's screen.
 *
 * One screen, content by `can()` (#476), and this is the line between the two
 * halves. It is not "do they hold `tickets`" but "are they on the roster at
 * all": a secretary who also dances reads both halves on the same rows, and a
 * blagajna account that neither leads nor dances would otherwise get a booking
 * with no numbers on it in the list and three segments about a postava it has
 * no part in on the page.
 *
 * The same answer also decides which performances are listed: the roster reads
 * EVERY evening of the season, public or not (ADR-0024), because a ship call is
 * an evening a dancer has to turn up for; the blagajna's schedule is the
 * ticketed one, because a booking sells nothing.
 */
export function showsRosterHalf(voditelj: boolean, hasMember: boolean): boolean {
  return voditelj || hasMember
}

/** A performance with nothing sold yet: the shape every loader starts from. */
export function emptySales(showId: string, venue: Venue): PerformanceSales {
  return {
    showId,
    venue,
    online: 0,
    partner: 0,
    comp: 0,
    door: 0,
    legacy: 0,
    scanned: 0,
    ticketRevenueCents: 0,
    offlineRevenueCents: 0,
    paused: false,
    cancelled: false,
    moved: false,
    rescheduled: false,
  }
}

/** Every seat that is taken, wherever it came from. */
export function seatsSold(s: PerformanceSales): number {
  return s.online + s.partner + s.comp + s.door + s.legacy
}

/**
 * Seats held by a real `tickets` row: the three channels that produced an
 * ORDER, and so a person who can be written to.
 *
 * This, not `seatsSold`, is what locks the venue field on Uredi (#502 review):
 * a door line has no buyer and no address, so it is not what makes moving a
 * house something people have to be told about. The route measures the same
 * thing with `getActiveTicketCountForShow`, so the field a cashier sees
 * disabled is exactly the one the server would refuse.
 */
export function ticketedSeats(s: PerformanceSales): number {
  return s.online + s.partner + s.comp
}

/**
 * Whether this viewer may open this evening at all.
 *
 * The mirror of the rule that keeps bookings off a sales list: a blagajna
 * account that neither leads nor dances is not shown a ship call, so it must
 * not be able to READ one by typing its id either. The detail page renders the
 * client and the voditelj's note, which are roster facts about an evening that
 * sells nothing — a `notFound()` is the honest answer and it matches what the
 * list already says exists.
 */
export function mayOpenPerformance(opts: { roster: boolean; isPublic: boolean }): boolean {
  return opts.roster || opts.isPublic
}

/**
 * Seats still sellable. May be NEGATIVE, and is left that way on purpose: an
 * oversold room is a miscounted door batch somebody has to notice, and a
 * `Math.max(0, …)` here would hide it behind a comfortable zero.
 */
export function seatsRemaining(s: PerformanceSales): number {
  return remainingSeats({
    capacity: VENUE_CAPACITY[s.venue],
    activeTicketCount: s.online + s.partner + s.comp,
    inPersonSold: s.door,
    legacyReserved: s.legacy,
  })
}

/** All the money this evening took, ledger included. */
export function revenueCents(s: PerformanceSales): number {
  return s.ticketRevenueCents + s.offlineRevenueCents
}

/**
 * Why the offline sales ledger refused, in a sentence the person can act on.
 *
 * `POST /api/shows/[id]/offline-sales` predates Cecilija and answers `/admin`
 * too, so its `error` is developer English ("That correction takes back more
 * adult tickets at €20.00 than were ever recorded"). It also answers a stable
 * `code` (`OfflineSaleValidationError`), and these are the refusals a cashier
 * standing at the entrance can FIX — a price above face value, a missing
 * reason, a correction bigger than what went in. So the code is translated
 * here and the rule stays the route's. An unknown code is the generic
 * sentence: a new one must not render as `undefined`.
 */
export function ledgerErrorMessage(code: string | undefined): string {
  const known: Record<string, string | undefined> = LEDGER_MESSAGES
  return (code && known[code]) || APP_STRINGS.showActions.failed
}

/**
 * The typing is the drift guard: a code added to or renamed in
 * `OfflineSaleErrorCode` fails `tsc` here rather than reaching a cashier as
 * "pokušaj ponovno".
 */
const LEDGER_MESSAGES: Record<OfflineSaleErrorCode, string> = APP_STRINGS.showActions.door.errors

export interface ChannelCount {
  key: 'online' | 'partner' | 'comp' | 'door' | 'legacy'
  label: string
  value: number
}

/**
 * The five sources, in ledger order, with the empty ones left out.
 *
 * Dropping a zero keeps a phone row to one short line; the order never changes,
 * so the eye still finds "vrata" in the same place from row to row.
 */
export function channelSplit(s: PerformanceSales): ChannelCount[] {
  const all: ChannelCount[] = [
    { key: 'online', label: S.channels.online, value: s.online },
    { key: 'partner', label: S.channels.partner, value: s.partner },
    { key: 'comp', label: S.channels.comp, value: s.comp },
    { key: 'door', label: S.channels.door, value: s.door },
    { key: 'legacy', label: S.channels.legacy, value: s.legacy },
  ]
  return all.filter((c) => c.value !== 0)
}

export interface SalesBadge {
  key: 'cancelled' | 'paused' | 'moved' | 'rescheduled'
  label: string
}

/**
 * What is true of this evening besides its numbers, worst news first.
 *
 * Cancelled leads because it is the one that makes every other line moot; the
 * two audit badges come last because a buyer has already been told about them.
 */
export function salesBadges(s: PerformanceSales): SalesBadge[] {
  const out: SalesBadge[] = []
  if (s.cancelled) out.push({ key: 'cancelled', label: S.badges.cancelled })
  if (s.paused) out.push({ key: 'paused', label: S.badges.paused })
  if (s.moved) out.push({ key: 'moved', label: S.badges.moved })
  if (s.rescheduled) out.push({ key: 'rescheduled', label: S.badges.rescheduled })
  return out
}

export interface NumberLine {
  label: string
  value: string
}

/**
 * The detail page's list of numbers.
 *
 * `canFinance` is a gate on the DATA, not on a CSS class: a viewer without
 * `finance` never has the money in their payload at all, so no template can
 * leak it by forgetting a condition. This is the same shape the comp and
 * lineup views use for their own "visible" rules.
 */
export function performanceNumbers(s: PerformanceSales, canFinance: boolean): NumberLine[] {
  const N = S.numbers
  const lines: NumberLine[] = [
    { label: N.sold, value: `${seatsSold(s)}` },
    { label: N.remaining, value: `${seatsRemaining(s)}` },
    { label: N.scanned, value: `${s.scanned}` },
    { label: N.online, value: `${s.online}` },
    { label: N.partner, value: `${s.partner}` },
    { label: N.comp, value: `${s.comp}` },
    { label: N.door, value: `${s.door}` },
    { label: N.legacy, value: `${s.legacy}` },
  ]
  if (canFinance) lines.push({ label: N.revenue, value: formatEur(revenueCents(s)) })
  return lines
}

export interface SalesRowView {
  /** "132/350". */
  soldOf: string
  /** "još 218", or the sentence an oversold room gets instead. */
  remaining: string
  /** "online 80 · partner 12 · vrata 30", or "Još nema prodaje." */
  split: string
  badges: SalesBadge[]
}

/** Everything one row of the list prints, so the page itself has no logic. */
export function salesRowView(s: PerformanceSales): SalesRowView {
  const left = seatsRemaining(s)
  const split = channelSplit(s)
  return {
    soldOf: S.soldOf(seatsSold(s), VENUE_CAPACITY[s.venue]),
    remaining: left < 0 ? S.over(-left) : S.remaining(left),
    split: split.length === 0 ? S.none : split.map((c) => `${c.label} ${c.value}`).join(' · '),
    badges: salesBadges(s),
  }
}
