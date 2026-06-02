import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { getPayload } from 'payload'
import config from '@payload-config'
import { partnerIdOf, isPartner } from '@/lib/access/roles'
import {
  createPartnerSale,
  PartnerSaleError,
  type PartnerSaleShow,
} from '@/lib/partner/create-partner-sale'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'
import { getActiveTicketCountForShow, type PoolQuery } from '@/lib/tickets/sold-seats'
import { generateQrToken } from '@/lib/qr-token'
import { generateOrderCode as makeOrderCode } from '@/lib/tickets/order-code'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/partner/sell — a partner issues tickets for an active upcoming show.
// Local API runs overrideAccess, so this route re-checks the caller is a partner
// and binds the sale to THEIR own partner id (never trusts a body-supplied one).
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })

  if (!isPartner(user as { role?: string } | null)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const partnerId = partnerIdOf(user as { role?: string; partner?: unknown } | null)
  if (partnerId == null) {
    return NextResponse.json({ error: 'Account not linked to a partner' }, { status: 403 })
  }

  // A deactivated partner cannot sell.
  const partnerRecord = await payload
    .findByID({ collection: 'partners', id: partnerId as number, depth: 0 })
    .catch(() => null)
  if (!partnerRecord || partnerRecord.active === false) {
    return NextResponse.json({ error: 'Partner is inactive' }, { status: 403 })
  }

  let body: { showId?: unknown; adults?: unknown; children?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const showId = Number(body.showId)
  const adults = Number(body.adults)
  const children = Number(body.children)
  if (!Number.isFinite(showId)) {
    return NextResponse.json({ error: 'Invalid show' }, { status: 400 })
  }

  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  // Today's date in the venue's timezone for the upcoming-show guard.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })

  try {
    const result = await createPartnerSale(
      { partnerId: Number(partnerId), showId, adults, children, today },
      {
        loadShow: async (id): Promise<PartnerSaleShow | null> => {
          const doc = await payload.findByID({ collection: 'shows', id, depth: 0 }).catch(() => null)
          if (!doc) return null
          const venue = doc.venue as Venue
          return {
            id: Number(doc.id),
            date: doc.date as string,
            status: doc.status as 'active' | 'cancelled',
            capacity: VENUE_CAPACITY[venue],
            inPersonSold: (doc.inPersonSold as number) ?? 0,
            legacyReserved: (doc.legacyReserved as number) ?? 0,
          }
        },
        countActiveTickets: (id) =>
          getActiveTicketCountForShow((sql, params) => pool.query(sql, params), id),
        generateOrderCode: () =>
          makeOrderCode({
            isUnique: async (code) => {
              const r = await payload.find({
                collection: 'orders',
                where: { code: { equals: code } },
                limit: 1,
                depth: 0,
              })
              return r.docs.length === 0
            },
            randomInt: (max) => randomInt(max),
          }),
        generateToken: generateQrToken,
        persist: async ({ order, tickets }) => {
          const orderDoc = await payload.create({
            collection: 'orders',
            data: {
              code: order.code,
              channel: 'partner',
              partner: Number(partnerId),
              buyerName: null,
              email: null,
              adultCount: order.adultCount,
              childCount: order.childCount,
              total: order.totalCents,
              refundStatus: 'none',
              show: order.showId,
            },
          })
          // One row per person, sequential so serial ids stay in issuance order
          // (the PDF derives CODE-N from that order).
          for (const t of tickets) {
            await payload.create({
              collection: 'tickets',
              data: { token: t.token, type: t.type, status: 'active', order: Number(orderDoc.id) },
            })
          }
          return { orderId: String(orderDoc.id) }
        },
      },
    )

    return NextResponse.json({
      orderId: result.orderId,
      code: result.code,
      totalCents: result.totalCents,
      adultCount: result.adultCount,
      childCount: result.childCount,
      ticketCount: result.tickets.length,
    })
  } catch (err) {
    if (err instanceof PartnerSaleError) {
      const status = err.code === 'OVERSELL' ? 409 : 400
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    console.error('[partner/sell] unexpected error', err)
    return NextResponse.json({ error: 'Could not complete the sale' }, { status: 500 })
  }
}
