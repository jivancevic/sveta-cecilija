import { NextRequest, NextResponse } from 'next/server'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'
import {
  moveShowToZimsko,
  previewVenueMove,
  type VenueChangeShow,
  type VenueChangeBuyer,
  type MoveToZimskoDeps,
} from '@/lib/venue-change'
import { sendVenueChangeEmail } from '@/lib/email/send-venue-change-email'
import type { Venue } from '@/lib/venues'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin-only "Mark show as moved to Zimsko" workflow (#94).
//   GET  → preview: affected online-buyer count + sample emails, no writes.
//   POST → confirm: atomically flip venue + record audit, then notify buyers.

type Pool = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

function buildDeps(pool: Pool, brevoApiKey: string): MoveToZimskoDeps {
  return {
    getShow: async (showId): Promise<VenueChangeShow | null> => {
      const res = await pool.query(
        `SELECT id, date, time, venue, venue_changed_at FROM shows WHERE id = $1`,
        [Number(showId)],
      )
      const row = res.rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        date: typeof row.date === 'string' ? row.date.slice(0, 10) : String(row.date ?? '').slice(0, 10),
        time: String(row.time ?? ''),
        venue: row.venue as Venue,
        venueChangedAt: row.venue_changed_at ? new Date(row.venue_changed_at as string).toISOString() : null,
      }
    },
    findBuyers: async (showId): Promise<VenueChangeBuyer[]> => {
      // One notice per person, not per order: a buyer who placed several orders
      // for the same show should get a single venue-change email. DISTINCT ON
      // collapses by lowercased email, keeping the earliest order's name/locale.
      // Any channel with an email on file is an operational recipient (ADR-0019,
      // #320): a comp guest who claimed their slip must hear the venue moved just
      // like an online buyer. Unclaimed comp/partner slips carry no email and are
      // filtered out by `email IS NOT NULL`.
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
      return res.rows.map((r): VenueChangeBuyer => ({
        orderId: String(r.id),
        name: String(r.buyer_name ?? ''),
        email: String(r.email ?? ''),
        locale: r.locale === 'hr' ? 'hr' : r.locale === 'en' ? 'en' : null,
      }))
    },
    claimMove: async (showId, userId): Promise<boolean> => {
      const res = await pool.query(
        `UPDATE shows
         SET venue = 'zimsko-kino', venue_changed_at = NOW(), venue_changed_by_id = $2, updated_at = NOW()
         WHERE id = $1 AND venue = 'ljetno-kino' AND venue_changed_at IS NULL
         RETURNING id`,
        [Number(showId), Number(userId)],
      )
      return res.rows.length > 0
    },
    sendVenueChangeEmail: async (buyer, show): Promise<boolean> =>
      sendVenueChangeEmail(
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
    const preview = await previewVenueMove(id, deps)
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

  const pool = (payload.db as unknown as { pool: Pool }).pool
  const deps = buildDeps(pool, brevoApiKey)
  try {
    const result = await moveShowToZimsko({ showId: id, userId: String(user.id) }, deps)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Move failed'
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 400 })
  }
}
