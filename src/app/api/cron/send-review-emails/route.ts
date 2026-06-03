import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  dispatchReviewEmails,
  type EligibleOrder,
} from '@/lib/review-email/dispatch-review-emails'
import { sendReviewEmail } from '@/lib/email/send-review-email'
import { ensureOptOutToken } from '@/lib/review-consent/review-consent'
import { generateQrToken } from '@/lib/qr-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cron-triggered endpoint. Authenticated by a shared `CRON_SECRET` env var
// presented in `Authorization: Bearer <secret>`. Configure a Coolify cron
// (or any uptime/cron-as-a-service) to hit this every 15 minutes; the
// idempotency guard (atomic UPDATE on review_email_sent_at) ensures rerunning
// is safe — emails go out exactly once per order.
//
// Why an HTTP cron and not Payload Jobs:
//   - Payload Jobs is not configured for this project, and adding it pulls in
//     a worker process / scheduler that Coolify's single-container deploy
//     doesn't run. A 1-route HTTP endpoint + an external scheduler stays in
//     the existing infra envelope.
//   - All other one-off operations (refund, in-person sales) are already
//     HTTP-route shaped, so this matches the established pattern.
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } }).pool

  const tripadvisorUrl =
    process.env.TRIPADVISOR_REVIEW_URL ??
    // Listing d1898279 per issue #35.
    'https://www.tripadvisor.com/UserReviewEdit-g303821-d1898279-Moreska_Sword_Dance-Korcula_Korcula_Island_Dubrovnik_Neretva_County_Dalmatia.html'
  const googleReviewUrl =
    process.env.GOOGLE_REVIEW_URL ??
    // Placeholder fallback until issue #36 publishes the Google Business
    // Profile review link. Sends users to a sensible Google Maps search so
    // they aren't dead-ended.
    'https://www.google.com/maps/search/?api=1&query=Moreska+HGD+Sveta+Cecilija+Korcula'

  const brevoApiKey = process.env.BREVO_API_KEY
  if (!brevoApiKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 })
  }

  try {
    const result = await dispatchReviewEmails(
      { now: new Date() },
      {
        findEligibleOrders: async (cutoff) => {
          // Show date is stored as a calendar date (UTC midnight) and time as
          // 'HH:MM' (Europe/Zagreb wall clock). Construct the show start by
          // adding the time to the date in the Zagreb timezone, then compare
          // to cutoff (a UTC instant). Postgres handles the tz arithmetic.
          //
          // We INCLUDE refund_status='none' AND ticket count > 0 here so the
          // worker only sees orders worth claiming.
          const res = await pool.query(
            `SELECT o.id, o.buyer_name, o.email, o.locale
             FROM orders o
             JOIN shows s ON s.id = o.show_id
             WHERE o.review_email_sent_at IS NULL
               AND o.review_opt_out IS NOT TRUE
               AND o.refund_status = 'none'
               AND (COALESCE(o.adult_count, 0) + COALESCE(o.child_count, 0)) > 0
               AND ((s.date::date)::text || ' ' || s.time)::timestamp AT TIME ZONE 'Europe/Zagreb' <= $1`,
            [cutoff.toISOString()],
          )
          return res.rows.map((r): EligibleOrder => ({
            id: String(r.id),
            buyerName: String(r.buyer_name ?? ''),
            email: String(r.email ?? ''),
            locale: r.locale === 'hr' ? 'hr' : r.locale === 'en' ? 'en' : null,
          }))
        },
        claimOrder: async (orderId) => {
          // Atomic claim — first writer wins. See feedback_atomic_db_updates.md.
          const res = await pool.query(
            `UPDATE orders
             SET review_email_sent_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND review_email_sent_at IS NULL
             RETURNING id`,
            [Number(orderId)],
          )
          return res.rows.length > 0
        },
        releaseClaim: async (orderId) => {
          await pool.query(
            `UPDATE orders SET review_email_sent_at = NULL, updated_at = NOW()
             WHERE id = $1`,
            [Number(orderId)],
          )
        },
        sendEmail: async (order) => {
          // Ensure a per-order unsubscribe token exists, then build the opt-out
          // link the email footer renders (#148).
          const token = await ensureOptOutToken(order.id, {
            getExistingToken: async (orderId) => {
              const r = await pool.query(
                `SELECT review_opt_out_token FROM orders WHERE id = $1`,
                [Number(orderId)],
              )
              return (r.rows[0]?.review_opt_out_token as string | null) ?? null
            },
            setTokenIfAbsent: async (orderId, t) => {
              const r = await pool.query(
                `UPDATE orders SET review_opt_out_token = $2, updated_at = NOW()
                 WHERE id = $1 AND review_opt_out_token IS NULL
                 RETURNING review_opt_out_token`,
                [Number(orderId), t],
              )
              return (r.rows[0]?.review_opt_out_token as string | undefined) ?? null
            },
            generateToken: generateQrToken,
          })
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://moreska.eu'
          await sendReviewEmail(
            {
              orderId: order.id,
              buyer: { name: order.buyerName, email: order.email },
              locale: order.locale ?? 'en',
              tripadvisorUrl,
              googleReviewUrl,
              unsubscribeUrl: `${baseUrl}/unsubscribe/${encodeURIComponent(token)}`,
            },
            { fetch: globalThis.fetch, brevoApiKey },
          )
        },
      },
    )
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed'
    console.error('[cron/send-review-emails]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
