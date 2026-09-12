// How Narudžbe reads an order out loud (#501).
//
// Every sentence the list and the detail print, as pure functions over the
// repo's domain rows. Nothing here touches the database and nothing here
// decides anything: the money comes off the order row (never a SUM across the
// join to tickets — that multiplies by the party size), the refund state comes
// off `refundStatus`, and this file only chooses words.
//
// Dates and times are Europe/Zagreb throughout. A ticket is scanned at the gate
// in Korčula and the row is written by a server in Nuremberg, so a scan at
// 00:30 CEST would otherwise be reported as the previous evening.

import { VENUE_LABEL, type Venue } from '@/lib/venues'
import type { OrderPerformance, OrderRow, OrderTicketRow } from '@/lib/repo/orders'
import { pluralize } from './roster-loaders'
import { APP_STRINGS, MONTHS_GENITIVE, shortWeekday } from './strings'

const S = APP_STRINGS.orders

/** "50,00 €" — cents, in the spelling a Croatian reader expects. */
export function formatEur(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const whole = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}${whole},${rest} €`
}

/** "2 odrasle, 1 dječja" — the party, with the empty half left out. */
export function partyLabel(adults: number, children: number): string {
  const parts: string[] = []
  if (adults > 0) parts.push(pluralize(adults, S.adults))
  if (children > 0) parts.push(pluralize(children, S.children))
  return parts.join(', ')
}

/** "26 narudžbi" — how many rows the filters matched, above the list. */
export function foundLabel(total: number): string {
  return pluralize(total, S.count)
}

/**
 * "Online", "Partner · Kaleta", "Gratis · Marija Fabris", "Online · Promo".
 *
 * The channel first, then what makes this one of it. A promo order is an
 * ONLINE order that carried a code (ADR-0018) and the label says exactly that:
 * calling it "Promo" would invent a fourth channel that does not exist.
 */
export function channelLabel(order: OrderRow): string {
  const base = S.channels[order.channel]
  if (order.channel === 'partner') return order.partnerName ? `${base} · ${order.partnerName}` : base
  if (order.channel === 'comp') return order.memberName ? `${base} · ${order.memberName}` : base
  return order.promoCode ? `${base} · ${S.promo}` : base
}

/** "pet, 14. kolovoza · Ljetno kino" — short, because it sits inside a row. */
export function performanceLabel(show: OrderPerformance | null): string {
  if (!show) return S.detail.showGone
  const d = new Date(`${show.date}T12:00:00.000Z`)
  const when = Number.isNaN(d.getTime())
    ? show.date
    : `${shortWeekday(show.date)}, ${d.getUTCDate()}. ${MONTHS_GENITIVE[d.getUTCMonth()]}`
  // An unknown slug is printed as it is: a performance at an odd place is still
  // better read with a strange word in it than with a hole.
  const where = VENUE_LABEL.hr[show.venue as Venue] ?? show.venue
  return `${when} · ${where}`
}

/**
 * Whether the Povrat button belongs on this order's screen, and why not.
 *
 *   - `hidden`      the viewer does not hold `refunds`. Not greyed out: an
 *                   action a person can never take is not an action (ADR-0023).
 *   - `already`     the money is back. The refund engine self-heals a retry,
 *                   but a button that says "Povrat" on a refunded order lies.
 *   - `not-payable` a comp or an old row with no payment intent behind it;
 *                   `refundOrder` would throw, so the screen says so first.
 */
export function refundOffer(
  order: Pick<OrderRow, 'refunded' | 'hasPayment' | 'totalCents'>,
  viewerCanRefund: boolean,
): 'hidden' | 'available' | 'already' | 'not-payable' {
  if (!viewerCanRefund) return 'hidden'
  if (order.refunded) return 'already'
  if (!order.hasPayment || order.totalCents <= 0) return 'not-payable'
  return 'available'
}

export interface TicketView {
  type: string
  state: string
  cancelled: boolean
  scan: string
}

/** One line of the Ulaznice panel: what it is, whether it counts, whether it is in. */
export function ticketView(ticket: OrderTicketRow): TicketView {
  const D = S.detail
  const when = ticket.scanned ? zagrebStamp(ticket.scannedAt) : ''
  const reason =
    ticket.cancelReason === 'refund'
      ? D.reasonRefund
      : ticket.cancelReason === 'storno'
        ? D.reasonStorno
        : null

  return {
    type: ticket.type === 'child' ? D.child : D.adult,
    state: ticket.cancelled ? (reason ? `${D.cancelled} · ${reason}` : D.cancelled) : D.active,
    cancelled: ticket.cancelled,
    scan: ticket.scanned ? (when ? D.scanned(when) : D.scannedNoTime) : D.notScanned,
  }
}

const ZAGREB_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zagreb',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * "14. kolovoza u 00:30" — an instant on the Korčula wall clock.
 *
 * Empty string when the timestamp cannot be read: a row with a broken date is
 * still worth showing, just without a lie about when it happened.
 */
export function zagrebStamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const parts = Object.fromEntries(ZAGREB_PARTS.formatToParts(ms).map((p) => [p.type, p.value]))
  const hour = parts.hour === '24' ? '00' : parts.hour
  const month = MONTHS_GENITIVE[Number(parts.month) - 1] ?? ''
  return `${Number(parts.day)}. ${month} u ${hour}:${parts.minute}`
}

/** How many pages a result set has. Nothing found is still one (empty) page. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)))
}

export interface OrderRowView {
  href: string
  buyer: string
  code: string | null
  performance: string
  party: string
  total: string
  channel: string
  refunded: boolean
}

/** Everything one row of the list prints, gathered so the page has no logic. */
export function orderRowView(order: OrderRow): OrderRowView {
  const buyer = (order.buyerName ?? '').trim()
  return {
    href: `/app/orders/${order.id}`,
    buyer: buyer || S.detail.noName,
    code: order.code,
    performance: performanceLabel(order.show),
    party: partyLabel(order.adultCount, order.childCount),
    total: formatEur(order.totalCents),
    channel: channelLabel(order),
    refunded: order.refunded,
  }
}
