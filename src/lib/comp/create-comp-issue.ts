// Pure comp-ticket issue flow (ADR-0019, #318). The free, admin-only sibling of
// createPartnerSale: an admin issues goodwill tickets to a society member, who
// hands them to family and friends. Validates, guards against oversell under the
// same advisory lock, issues one typed ticket per person at total=0, and
// persists a comp-channel order attributed to a member (no Stripe, no revenue).
//
// Differences from a partner sale: tickets are free (channel 'comp' => total=0),
// attribution is a REQUIRED member (not a reseller), and the printed HOLDER name
// defaults to the member's name but is editable at issue time. No DB or HTTP
// here — the route wires deps.

import { issueTickets, type IssuedOrder, type TicketType } from '../tickets/ticket-issuance'
import { assertCanSell } from '../tickets/seat-availability'

export type CompIssueErrorCode =
  | 'INVALID_QUANTITY'
  | 'MEMBER_REQUIRED'
  | 'SHOW_NOT_FOUND'
  | 'SHOW_INACTIVE'
  | 'SHOW_PAST'
  | 'OVERSELL'

export class CompIssueError extends Error {
  constructor(
    public readonly code: CompIssueErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CompIssueError'
  }
}

export interface CompIssueShow {
  id: number
  /** YYYY-MM-DD (or ISO; only the date part is compared). */
  date: string
  status: 'active' | 'cancelled'
  /** VENUE_CAPACITY[venue], resolved by the caller. */
  capacity: number
  inPersonSold: number
  legacyReserved: number
}

export interface CompIssueInput {
  /** The society member receiving the comps. REQUIRED — attribution is the point. */
  memberId: number
  showId: number
  adults: number
  children: number
  /** Today's date (YYYY-MM-DD, Europe/Zagreb) for the upcoming-show guard. */
  today: string
  /** Printed HOLDER name; defaults to the member's name, editable at issue. */
  buyerName?: string | null
  /** Optional email; when present the buyer-comms rules apply unchanged. */
  email?: string | null
  /** Locale for the printed slips. */
  locale?: 'en' | 'hr'
}

export interface PersistTicket {
  token: string
  type: TicketType
}

export interface CompIssueDeps {
  loadShow: (showId: number) => Promise<CompIssueShow | null>
  /** COUNT of active tickets for the show, read fresh for the oversell guard. */
  countActiveTickets: (showId: number) => Promise<number>
  generateOrderCode: () => Promise<string>
  generateToken: () => string
  /** Persist the order + its tickets atomically; returns the new order id. */
  persist: (args: { order: IssuedOrder; tickets: PersistTicket[] }) => Promise<{ orderId: string }>
  /**
   * Serializes the count→capacity-check→insert critical section per show so a
   * comp issue and a concurrent partner/online sell can't both pass the oversell
   * guard (#179). Defaults to a pass-through; the route wires it to the same
   * Postgres advisory lock partner sells use (`withShowSellLock`).
   */
  withSeatLock?: <T>(showId: number, critical: () => Promise<T>) => Promise<T>
}

export interface CompIssueResult {
  orderId: string
  code: string
  adultCount: number
  childCount: number
  tickets: { token: string; type: TicketType; ref: string }[]
}

export async function createCompIssue(
  input: CompIssueInput,
  deps: CompIssueDeps,
): Promise<CompIssueResult> {
  const { memberId, showId, adults, children, today } = input

  if (!Number.isInteger(memberId) || memberId <= 0) {
    throw new CompIssueError('MEMBER_REQUIRED', 'A comp must be attributed to a member')
  }
  if (
    !Number.isInteger(adults) ||
    !Number.isInteger(children) ||
    adults < 0 ||
    children < 0
  ) {
    throw new CompIssueError('INVALID_QUANTITY', 'Adult and child counts must be non-negative integers')
  }
  if (adults + children === 0) {
    throw new CompIssueError('INVALID_QUANTITY', 'A comp must contain at least one ticket')
  }

  const show = await deps.loadShow(showId)
  if (!show) {
    throw new CompIssueError('SHOW_NOT_FOUND', 'Show not found')
  }
  if (show.status !== 'active') {
    throw new CompIssueError('SHOW_INACTIVE', 'This show is cancelled and cannot be issued')
  }
  // A show on today's date is still issuable; only strictly-past dates are rejected.
  if (show.date.slice(0, 10) < today) {
    throw new CompIssueError('SHOW_PAST', 'This show has already taken place')
  }

  // Same per-show advisory lock as partner sells so comps participate in the
  // shared oversell serialization (they consume real seats).
  const withSeatLock = deps.withSeatLock ?? (<T>(_id: number, fn: () => Promise<T>) => fn())

  return withSeatLock(showId, async () => {
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
      throw new CompIssueError('OVERSELL', (e as Error).message)
    }

    // channel 'comp' => total 0 inside issueTickets (ADR-0019). The HOLDER name
    // defaults to the member's name (resolved by the caller) but is editable.
    const buyerName = input.buyerName?.trim() ? input.buyerName.trim() : null
    const email = input.email?.trim() ? input.email.trim() : null

    const issued = await issueTickets(
      {
        show: { id: show.id },
        channel: 'comp',
        adults,
        children,
        locale: input.locale ?? 'en',
        memberId,
        buyer: { name: buyerName, email },
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
      adultCount: adults,
      childCount: children,
      tickets,
    }
  })
}
