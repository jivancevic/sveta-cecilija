import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import {
  claimOrder,
  ClaimValidationError,
  type ClaimableOrder,
} from '@/lib/claim/claim-order'
import { sendTicketEmail } from '@/lib/email/send-ticket-email'
import { generateQrPng } from '@/lib/email/qr'
import { claimRateLimiter, clientIpFromHeaders } from '@/lib/rate-limit/claim-rate-limit'
import { scanRedirectUrl } from '@/lib/site-url'
import type { Venue } from '@/lib/venues'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/scan/[token]/claim — UNAUTHENTICATED. A guest holding a partner
// paper slip attaches their email to the order (first-claimer-wins) and is sent
// the digital ticket PDF. Access control is possession of the (unguessable) QR
// token; only an unclaimed order (email IS NULL) with an ACTIVE ticket can be
// claimed, and only once.
//
// Accepted risk (ADR-0008): "token possession = auth" + first-claimer-wins means
// whoever sees the QR first can attach THEIR email. A per-token + per-IP throttle
// (#184) raises the bar against pre-emptive claim of a leaked token and against
// hammering this open public write endpoint, without affecting a single
// legitimate claim. In-memory limiter — fine on single-instance Coolify.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // Redirect against the public origin, not req.url — see scanRedirectUrl.
  const back = (params: Record<string, string> = {}) =>
    NextResponse.redirect(scanRedirectUrl(token, params), { status: 303 })

  // Throttle before any parsing/DB work so a flood is cheap to reject.
  const rate = claimRateLimiter.check(token, clientIpFromHeaders(req.headers))
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many claim attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    )
  }

  let name = ''
  let email = ''
  try {
    const form = await req.formData()
    name = String(form.get('name') ?? '')
    email = String(form.get('email') ?? '')
  } catch {
    return back({ claim: 'error' })
  }

  const payload = await getPayload({ config })
  const drizzle: any = (payload.db as any).drizzle

  // Resolve the order from the token — only via an ACTIVE ticket. A cancelled
  // (storno/refund) slip must not be claimable (it would attach PII to a dead
  // order and email a zero-ticket PDF). Unknown/voided token → bounce back.
  const ord: any = await drizzle.execute(
    sql`SELECT order_id FROM tickets WHERE token = ${token} AND status = 'active' LIMIT 1`,
  )
  const orderRow = (ord.rows ?? ord)[0]
  if (!orderRow) return back()
  const orderId = String(orderRow.order_id)

  const orderFromRow = (row: any): ClaimableOrder => ({
    orderId: String(row.id),
    code: String(row.code ?? ''),
    showId: String(row.show_id),
    adultCount: Number(row.adult_count ?? 0),
    childCount: Number(row.child_count ?? 0),
    totalCents: Number(row.total ?? 0),
    locale: row.locale === 'hr' ? 'hr' : 'en',
  })

  try {
    const result = await claimOrder(
      { orderId, name, email },
      {
        // Race-safe first-claimer-wins: only attaches when email IS NULL.
        attachBuyer: async (oid, nm, em): Promise<ClaimableOrder | null> => {
          const res: any = await drizzle.execute(sql`
            UPDATE orders
            SET email = ${em}, buyer_name = ${nm}, updated_at = NOW()
            WHERE id = ${Number(oid)} AND email IS NULL
            RETURNING id, code, show_id, adult_count, child_count, total, locale
          `)
          const row = (res.rows ?? res)[0]
          if (!row) return null
          return orderFromRow(row)
        },
        // Re-load an already-claimed order with its ON-FILE buyer so a re-submit
        // re-sends to the address that won the claim (self-heal for a transient
        // send failure) and never to the re-submitter's input.
        loadClaimedOrder: async (oid) => {
          const res: any = await drizzle.execute(sql`
            SELECT id, code, show_id, adult_count, child_count, total, locale, email, buyer_name
            FROM orders WHERE id = ${Number(oid)} AND email IS NOT NULL LIMIT 1
          `)
          const row = (res.rows ?? res)[0]
          if (!row) return null
          return {
            order: orderFromRow(row),
            buyer: { name: String(row.buyer_name ?? ''), email: String(row.email) },
          }
        },
        // Returns whether the ticket email actually left (true) so claimOrder can
        // tell the buyer honestly. A thrown error or a Brevo non-2xx is `false`,
        // never a swallowed success. The claim attach has already committed; we
        // only report on delivery here.
        sendClaimedTickets: async (order, buyer): Promise<boolean> => {
          try {
            const showDoc = await payload.findByID({ collection: 'shows', id: Number(order.showId), depth: 0 })
            const ticketsRes: any = await drizzle.execute(sql`
              SELECT token, type FROM tickets
              WHERE order_id = ${Number(order.orderId)} AND status = 'active'
              ORDER BY id ASC
            `)
            const rows = (ticketsRes.rows ?? ticketsRes) as { token: string; type: string }[]
            if (rows.length === 0) {
              // Order has no active tickets (fully voided after attach): never
              // send an empty-ticket PDF. The claim itself already committed.
              console.error(`[claim] no active tickets to email orderId=${order.orderId} code=${order.code}`)
              return false
            }
            const tickets = rows.map((r, i) => ({
              token: String(r.token),
              type: (r.type === 'child' ? 'child' : 'adult') as 'adult' | 'child',
              ref: `${order.code}-${i + 1}`,
            }))
            return await sendTicketEmail(
              {
                orderId: order.orderId,
                buyer,
                show: {
                  date: (showDoc.date as string).slice(0, 10),
                  time: (showDoc.time as string) ?? '',
                  venue: showDoc.venue as Venue,
                },
                order: { adultCount: order.adultCount, childCount: order.childCount, total: order.totalCents },
                tickets,
                orderCode: order.code,
                locale: order.locale,
              },
              { fetch: globalThis.fetch, generateQrPng, brevoApiKey: process.env.BREVO_API_KEY ?? '' },
            )
          } catch (err) {
            console.error(`[claim] sendClaimedTickets failed orderId=${order.orderId} code=${order.code}`, err)
            return false
          }
        },
      },
    )

    // The banner is contingent on the email ACTUALLY leaving — never claim
    // "sent" on a swallowed failure. CLAIMED/ALREADY_CLAIMED both re-send and
    // report `emailed`; a false surfaces the honest "try again" banner so the
    // guest can re-submit (which self-heals once the send path recovers).
    return back(result.emailed ? { claimed: '1' } : { claim: 'error' })
  } catch (err) {
    if (err instanceof ClaimValidationError) return back({ claim: 'error' })
    console.error('[claim] unexpected error', err)
    return back({ claim: 'error' })
  }
}
