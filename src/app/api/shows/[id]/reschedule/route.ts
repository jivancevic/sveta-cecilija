import { NextRequest, NextResponse } from 'next/server'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import {
  rescheduleShow,
  previewReschedule,
  type RescheduleShow,
  type RescheduleBuyer,
  type RescheduleDeps,
} from '@/lib/show-reschedule'
import { sendDateChangeEmail } from '@/lib/email/send-date-change-email'
import { toIsoDate } from '@/lib/to-iso-date'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin-only "Reschedule show & notify buyers" workflow.
//   GET  → preview: current date + affected online-buyer count + sample emails.
//   POST { newDate }            → confirm: atomically move the date + audit, then notify buyers.
//   POST { newDate, test:true } → send the EN+HR preview to the logged-in admin only; no writes, no buyer mail.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Pool = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

function buildDeps(pool: Pool, brevoApiKey: string): RescheduleDeps {
  return {
    getShow: async (showId): Promise<RescheduleShow | null> => {
      const res = await pool.query(`SELECT id, date, time, venue FROM shows WHERE id = $1`, [Number(showId)])
      const row = res.rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        // pg returns the timestamptz column as a JS Date — normalise to YYYY-MM-DD
        // (a raw String(date).slice would yield "Mon Jun 22" → "Invalid Date").
        date: toIsoDate(row.date),
        time: String(row.time ?? ''),
        venue: row.venue === 'zimsko-kino' ? 'zimsko-kino' : 'ljetno-kino',
      }
    },
    findBuyers: async (showId): Promise<RescheduleBuyer[]> => {
      // One notice per person, not per order: a buyer who placed several orders
      // for the same show should get a single email. DISTINCT ON collapses by
      // lowercased email, keeping the earliest order's name/locale. Mirrors the
      // venue-change query, including its channel scope: any channel with an
      // email on file is an operational recipient (ADR-0019, #320) — a comp guest
      // who claimed their slip must hear the show was rescheduled. Unclaimed
      // comp/partner slips carry no email and are filtered by `email IS NOT NULL`.
      const res = await pool.query(
        `SELECT DISTINCT ON (lower(email)) id, buyer_name, email, locale
         FROM orders
         WHERE show_id = $1
           AND channel IN ('online', 'comp')
           AND email IS NOT NULL
           AND refund_status = 'none'
         ORDER BY lower(email), id`,
        [Number(showId)],
      )
      return res.rows.map((r): RescheduleBuyer => ({
        orderId: String(r.id),
        name: String(r.buyer_name ?? ''),
        email: String(r.email ?? ''),
        locale: r.locale === 'hr' ? 'hr' : r.locale === 'en' ? 'en' : null,
      }))
    },
    claimReschedule: async (showId, userId, expectedOldDate, newDate): Promise<boolean> => {
      // Store at 12:00:00+00 like the seed so date::date is timezone-stable.
      // Optimistic concurrency: only the call whose expected old date still
      // matches wins; a concurrent confirm claims 0 rows → date-mismatch.
      const res = await pool.query(
        `UPDATE shows
         SET date = ($2 || ' 12:00:00+00')::timestamptz,
             date_changed_at = NOW(),
             date_changed_by_id = $3,
             original_date = COALESCE(original_date, date),
             updated_at = NOW()
         WHERE id = $1 AND date::date = $4
         RETURNING id`,
        [Number(showId), newDate, Number(userId), expectedOldDate],
      )
      return res.rows.length > 0
    },
    sendDateChangeEmail: async (buyer, show): Promise<boolean> =>
      sendDateChangeEmail(
        {
          orderId: buyer.orderId,
          buyer: { name: buyer.name, email: buyer.email },
          show,
          locale: buyer.locale ?? 'en',
        },
        { fetch: globalThis.fetch, brevoApiKey },
      ),
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate
  const { id } = await params
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const deps = buildDeps(pool, process.env.BREVO_API_KEY ?? '')
  try {
    const preview = await previewReschedule(id, deps)
    return NextResponse.json(preview)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload, user } = gate
  const { id } = await params

  const brevoApiKey = process.env.BREVO_API_KEY
  if (!brevoApiKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as { newDate?: unknown; test?: unknown }
  const newDate = typeof body.newDate === 'string' ? body.newDate : ''
  if (!ISO_DATE_RE.test(newDate)) {
    return NextResponse.json({ error: 'newDate must be YYYY-MM-DD' }, { status: 400 })
  }

  const pool = (payload.db as unknown as { pool: Pool }).pool
  const deps = buildDeps(pool, brevoApiKey)

  // Test mode: send the EN + HR preview to the admin's own inbox. No DB write,
  // no buyer notification — the "let me see it first" path.
  if (body.test === true) {
    const adminEmail = typeof user.email === 'string' ? user.email : ''
    if (!adminEmail) {
      return NextResponse.json({ error: 'Your admin account has no email to send the test to.' }, { status: 400 })
    }
    try {
      const show = await deps.getShow(id)
      if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })
      const sample = { orderId: 'TEST', buyer: { name: 'Ivan Horvat', email: adminEmail } }
      const showDates = { oldDate: show.date, newDate, time: show.time, venue: show.venue }
      for (const locale of ['en', 'hr'] as const) {
        await sendDateChangeEmail({ ...sample, show: showDates, locale }, { fetch: globalThis.fetch, brevoApiKey })
      }
      return NextResponse.json({ status: 'test-sent', to: adminEmail })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test send failed'
      return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
    }
  }

  try {
    const result = await rescheduleShow({ showId: id, userId: String(user.id), newDate }, deps)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reschedule failed'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}
