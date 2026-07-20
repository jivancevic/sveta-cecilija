// Reconstructs a ticket email from a persisted order id and sends it via Brevo.
// The single send-a-ticket-email-for-an-existing-order path, shared by:
//   - the comp-issue route (send-on-issue when the admin entered an email), and
//   - the per-order "Resend ticket email" admin action.
//
// It mirrors the ticket-reconstruction logic of /api/orders/[id]/tickets.pdf
// (load order → derive CODE-N refs from ticket rows in issuance order → carry
// the comp `free` / partner `seller` slip flags) so an emailed slip is identical
// to the downloadable one. The online Stripe webhook keeps its own inline wiring
// (it already has the tickets in hand and must never block on a DB re-read).
//
// Returns a discriminated status so the caller can tell the admin the TRUTH:
//   - 'sent'    — Brevo accepted the message (2xx).
//   - 'skipped' — nothing to send: the order has no email on file.
//   - 'failed'  — an email exists but the send did not happen (missing show,
//                 no tickets, no Brevo key, or Brevo/network error). Never throws.

import { sendTicketEmail } from './send-ticket-email'
import { generateQrPng } from './qr'
import type { Venue } from '../venues'

export type OrderTicketEmailStatus = 'sent' | 'skipped' | 'failed'

export interface OrderTicketEmailResult {
  status: OrderTicketEmailStatus
  /** The address we sent (or would have sent) to; null when the order has none. */
  email: string | null
}

// Structural slice of the Payload local API this helper needs — keeps it unit
// testable with a fake, and avoids importing the concrete Payload type.
export interface OrderEmailPayload {
  findByID: (args: {
    collection: string
    id: number | string
    depth?: number
  }) => Promise<Record<string, unknown> | null>
  find: (args: {
    collection: string
    where: Record<string, unknown>
    limit?: number
    depth?: number
    sort?: string
  }) => Promise<{ docs: Record<string, unknown>[] }>
}

export interface SendOrderTicketEmailDeps {
  brevoApiKey?: string
  fetch?: typeof fetch
  // Seam for tests; defaults to the real Brevo-backed sender.
  sendTicketEmail?: typeof sendTicketEmail
  generateQrPng?: (data: string) => Promise<Buffer>
}

export async function sendOrderTicketEmail(
  payload: OrderEmailPayload,
  orderId: string | number,
  deps: SendOrderTicketEmailDeps = {},
): Promise<OrderTicketEmailResult> {
  const send = deps.sendTicketEmail ?? sendTicketEmail
  const qr = deps.generateQrPng ?? generateQrPng
  const id = Number.isFinite(Number(orderId)) ? Number(orderId) : orderId

  const order = await payload
    .findByID({ collection: 'orders', id, depth: 1 })
    .catch(() => null)
  // A missing order is a real error, not a skip: 'skipped' is reserved for the
  // "no email on file" case so the caller can show the benign green banner only
  // then. An order that can't be loaded must surface as a failure.
  if (!order) {
    console.error(`[sendOrderTicketEmail] order not found orderId=${String(orderId)}`)
    return { status: 'failed', email: null }
  }

  const email = typeof order.email === 'string' ? order.email.trim() : ''
  if (!email) return { status: 'skipped', email: null }

  const show =
    typeof order.show === 'object' && order.show !== null
      ? (order.show as { date?: string; time?: string; venue?: Venue })
      : null
  if (!show || !show.venue) {
    console.error(`[sendOrderTicketEmail] order missing show orderId=${String(order.id)}`)
    return { status: 'failed', email }
  }

  const ticketsRes = await payload
    .find({
      collection: 'tickets',
      where: { order: { equals: order.id } },
      limit: 500,
      depth: 0,
      // Sort by serial id so CODE-N refs match the originally-emailed PDF exactly
      // (created_at can tie at ms precision — see the tickets.pdf route note).
      sort: 'id',
    })
    // Honour the documented "never throws" contract — a DB hiccup here is a
    // failure to report, not an exception to bubble into the caller's response.
    .catch(() => null)
  if (!ticketsRes || ticketsRes.docs.length === 0) {
    console.error(`[sendOrderTicketEmail] no tickets orderId=${String(order.id)}`)
    return { status: 'failed', email }
  }

  const code = (order.code as string) || String(order.id)
  const tickets = ticketsRes.docs.map((d, i) => ({
    token: d.token as string,
    type: ((d.type as string) === 'child' ? 'child' : 'adult') as 'adult' | 'child',
    ref: `${code}-${i + 1}`,
  }))

  const isoDate = typeof show.date === 'string' ? show.date : ''
  const date = isoDate.slice(0, 10)
  const locale: 'en' | 'hr' = order.locale === 'hr' ? 'hr' : 'en'

  // Comp slips print "Complimentary" (no €-price); partner slips carry a SOLD BY
  // row. We only send when an email is on file, so the order is claimed and the
  // claim-invitation band never shows.
  const isComp = order.channel === 'comp'
  const isPartner = order.channel === 'partner'
  let seller: { name: string } | undefined
  if (isPartner) {
    const op = order.partner as { name?: string } | number | string | null | undefined
    seller =
      op != null && typeof op === 'object' && typeof op.name === 'string'
        ? { name: op.name }
        : undefined
  }

  const brevoApiKey = deps.brevoApiKey ?? process.env.BREVO_API_KEY ?? ''
  if (!brevoApiKey) {
    console.error(`[sendOrderTicketEmail] BREVO_API_KEY not set orderId=${String(order.id)}`)
    return { status: 'failed', email }
  }

  const ok = await send(
    {
      orderId: String(order.id),
      buyer: { name: (order.buyerName as string) ?? '', email },
      show: { date, time: (show.time as string) ?? '', venue: show.venue },
      order: {
        adultCount: (order.adultCount as number) ?? 0,
        childCount: (order.childCount as number) ?? 0,
        total: (order.total as number) ?? 0,
      },
      tickets,
      orderCode: code,
      locale,
      pdf: { free: isComp, seller, showClaimPrompt: false },
    },
    { fetch: deps.fetch ?? globalThis.fetch, generateQrPng: qr, brevoApiKey },
  )

  return { status: ok ? 'sent' : 'failed', email }
}
