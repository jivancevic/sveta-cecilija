// Pure partner sell flow (ADR-0008, #144). A partner picks an active upcoming
// show and adult/child counts; this validates, guards against oversell, issues
// one typed ticket per person at flat face value, and persists a partner-channel
// order with no PII / no Stripe. No DB or HTTP here — the route wires deps.
//
// Builds on `issueTickets` (flat face value, CODE-N refs) and `assertCanSell`
// (capacity − active tickets − inPersonSold − legacyReserved).

import { issueTickets, type IssuedOrder, type TicketType } from '../tickets/ticket-issuance'
import { assertCanSell } from '../tickets/seat-availability'

export type PartnerSaleErrorCode =
  | 'INVALID_QUANTITY'
  | 'SHOW_NOT_FOUND'
  | 'SHOW_INACTIVE'
  | 'SHOW_PAST'
  | 'OVERSELL'

export class PartnerSaleError extends Error {
  constructor(
    public readonly code: PartnerSaleErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PartnerSaleError'
  }
}

export interface PartnerSaleShow {
  id: number
  /** YYYY-MM-DD (or ISO; only the date part is compared). */
  date: string
  status: 'active' | 'cancelled'
  /** VENUE_CAPACITY[venue], resolved by the caller. */
  capacity: number
  inPersonSold: number
  legacyReserved: number
}

export interface PartnerSaleInput {
  partnerId: number
  showId: number
  adults: number
  children: number
  /** Today's date (YYYY-MM-DD, Europe/Zagreb) for the upcoming-show guard. */
  today: string
  /** Locale for the printed slips; partner sales carry no buyer locale. */
  locale?: 'en' | 'hr'
}

export interface PersistTicket {
  token: string
  type: TicketType
}

export interface PartnerSaleDeps {
  loadShow: (showId: number) => Promise<PartnerSaleShow | null>
  /** COUNT of active tickets for the show, read fresh for the oversell guard. */
  countActiveTickets: (showId: number) => Promise<number>
  generateOrderCode: () => Promise<string>
  generateToken: () => string
  /** Persist the order + its tickets atomically; returns the new order id. */
  persist: (args: { order: IssuedOrder; tickets: PersistTicket[] }) => Promise<{ orderId: string }>
}

export interface PartnerSaleResult {
  orderId: string
  code: string
  totalCents: number
  adultCount: number
  childCount: number
  tickets: { token: string; type: TicketType; ref: string }[]
}

export async function createPartnerSale(
  input: PartnerSaleInput,
  deps: PartnerSaleDeps,
): Promise<PartnerSaleResult> {
  const { partnerId, showId, adults, children, today } = input

  if (
    !Number.isInteger(adults) ||
    !Number.isInteger(children) ||
    adults < 0 ||
    children < 0
  ) {
    throw new PartnerSaleError('INVALID_QUANTITY', 'Adult and child counts must be non-negative integers')
  }
  if (adults + children === 0) {
    throw new PartnerSaleError('INVALID_QUANTITY', 'A sale must contain at least one ticket')
  }

  const show = await deps.loadShow(showId)
  if (!show) {
    throw new PartnerSaleError('SHOW_NOT_FOUND', 'Show not found')
  }
  if (show.status !== 'active') {
    throw new PartnerSaleError('SHOW_INACTIVE', 'This show is cancelled and cannot be sold')
  }
  // A show on today's date is still sellable; only strictly-past dates are rejected.
  if (show.date.slice(0, 10) < today) {
    throw new PartnerSaleError('SHOW_PAST', 'This show has already taken place')
  }

  const activeTicketCount = await deps.countActiveTickets(showId)
  try {
    assertCanSell(
      {
        capacity: show.capacity,
        activeTicketCount,
        inPersonSold: show.inPersonSold,
        legacyReserved: show.legacyReserved,
      },
      adults + children,
    )
  } catch (e) {
    throw new PartnerSaleError('OVERSELL', (e as Error).message)
  }

  // Flat face value + CODE-N refs handled inside issueTickets (channel 'partner').
  const issued = await issueTickets(
    {
      show: { id: show.id },
      channel: 'partner',
      adults,
      children,
      locale: input.locale ?? 'en',
      partnerId,
      buyer: null,
    },
    { generateOrderCode: deps.generateOrderCode },
  )

  const tickets = issued.tickets.map((t) => ({
    token: deps.generateToken(),
    type: t.type,
    ref: t.ref,
  }))

  const { orderId } = await deps.persist({
    order: issued,
    tickets: tickets.map(({ token, type }) => ({ token, type })),
  })

  return {
    orderId,
    code: issued.code,
    totalCents: issued.totalCents,
    adultCount: adults,
    childCount: children,
    tickets,
  }
}
