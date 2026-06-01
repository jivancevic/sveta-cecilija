// Pure issuance of a per-person ticket order (ADR-0007). Given a show, channel,
// party composition and locale, produce the Order shape plus one typed ticket
// per person, each with a `CODE-N` human reference. No DB, no Stripe, no email —
// the webhook and partner-sell route wire this to persistence and payment.

import { calculateOrderTotal, ADULT_PRICE_EUR, CHILD_PRICE_EUR } from '../pricing'

export type Channel = 'online' | 'partner'
export type TicketType = 'adult' | 'child'
export type Locale = 'en' | 'hr'

export interface IssueTicketsInput {
  show: { id: number }
  channel: Channel
  adults: number
  children: number
  locale: Locale
  /** Set on partner-channel orders; null/omitted online. */
  partnerId?: number | null
  /** Buyer PII — present online, null for an anonymous partner POS sale. */
  buyer?: { name?: string | null; email?: string | null } | null
}

export interface IssuedTicket {
  type: TicketType
  /** `${order.code}-${n}`, 1-indexed; adults first, then children. */
  ref: string
}

export interface IssuedOrder {
  code: string
  channel: Channel
  showId: number
  partnerId: number | null
  buyerName: string | null
  email: string | null
  locale: Locale
  adultCount: number
  childCount: number
  /** EUR cents. Online applies the 5-for-4 promo; partner is flat face value. */
  totalCents: number
  tickets: IssuedTicket[]
}

export interface IssueTicketsDeps {
  /** Yields a unique order code (see order-code.ts wired to a DB check). */
  generateOrderCode: () => Promise<string>
}

export async function issueTickets(
  input: IssueTicketsInput,
  deps: IssueTicketsDeps,
): Promise<IssuedOrder> {
  const { adults, children, channel } = input

  if (
    !Number.isInteger(adults) ||
    !Number.isInteger(children) ||
    adults < 0 ||
    children < 0
  ) {
    throw new Error('Ticket quantities must be non-negative integers')
  }
  if (adults + children === 0) {
    throw new Error('An order must contain at least one ticket')
  }

  // Online: every 5th ticket free (calculateOrderTotal). Partner sells at flat
  // face value — the promo is an online-only acquisition lever (ADR-0008).
  const totalCents =
    channel === 'online'
      ? calculateOrderTotal({ adults, children }).totalCents
      : (adults * ADULT_PRICE_EUR + children * CHILD_PRICE_EUR) * 100

  const code = await deps.generateOrderCode()

  const tickets: IssuedTicket[] = []
  let n = 0
  for (let i = 0; i < adults; i++) tickets.push({ type: 'adult', ref: `${code}-${++n}` })
  for (let i = 0; i < children; i++) tickets.push({ type: 'child', ref: `${code}-${++n}` })

  return {
    code,
    channel,
    showId: input.show.id,
    partnerId: input.partnerId ?? null,
    buyerName: input.buyer?.name ?? null,
    email: input.buyer?.email ?? null,
    locale: input.locale,
    adultCount: adults,
    childCount: children,
    totalCents,
    tickets,
  }
}
