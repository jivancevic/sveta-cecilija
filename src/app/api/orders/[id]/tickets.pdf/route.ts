import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { renderTicketsPdf } from '@/lib/email/render-tickets-pdf'
import { generateQrPng } from '@/lib/email/qr'
import { verifyTicketLink } from '@/lib/ticket-link'
import { isAuthed, isPartner, partnerIdOf } from '@/lib/access/roles'
import type { Venue } from '@/lib/venues'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const { id } = await params
  const orderId = Number.isFinite(Number(id)) ? Number(id) : id

  const order = await payload
    .findByID({ collection: 'orders', id: orderId as number, depth: 1 })
    .catch(() => null)

  if (!order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Auth: either a signed token (?t=...) tied to this order + buyer email,
  // or an authenticated admin/tehnika cookie session.
  const url = new URL(req.url)
  const linkToken = url.searchParams.get('t')
  const buyerEmail = (order.email as string) ?? ''

  let authorized = false
  if (linkToken && buyerEmail) {
    const result = verifyTicketLink(linkToken, String(order.id), buyerEmail)
    if (result.ok) authorized = true
  }
  if (!authorized) {
    const { user } = await payload.auth({ headers: req.headers })
    // Internal staff (admin/tehnika) can download any order's tickets.
    if (isAuthed(user as { role?: string } | null)) authorized = true
    // A partner can download the PDF for an order it sold (its own slips to
    // reprint), but no other partner's. order.partner is populated at depth 1.
    if (!authorized && isPartner(user as { role?: string } | null)) {
      const op = order.partner as { id?: number | string } | number | string | null | undefined
      const orderPartnerId = op != null && typeof op === 'object' ? op.id : op
      const self = partnerIdOf(user as { role?: string; partner?: unknown } | null)
      if (orderPartnerId != null && self != null && String(orderPartnerId) === String(self)) {
        authorized = true
      }
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const show =
    typeof order.show === 'object' && order.show !== null
      ? (order.show as { date: string; time: string; venue: Venue })
      : null
  if (!show) {
    return NextResponse.json({ error: 'Order missing show' }, { status: 500 })
  }

  // One ticket row per person since ADR-0007 — this find may return N rows.
  // One ticket row per person (ADR-0007). Fetch them all, in issuance order, so
  // the 2-up A5 PDF renders one block per person with its CODE-N reference.
  const ticketsRes = await payload.find({
    collection: 'tickets',
    where: { order: { equals: order.id } },
    limit: 500,
    depth: 0,
    // Sort by the serial id (insertion order from the webhook's sequential
    // createTickets) so CODE-N refs are deterministic. created_at can tie at
    // millisecond precision and Payload omits its id tiebreaker when the sort
    // already names created_at — that would permute the re-downloaded refs
    // relative to the emailed PDF.
    sort: 'id',
  })
  if (ticketsRes.docs.length === 0) {
    return NextResponse.json({ error: 'No tickets for this order' }, { status: 404 })
  }
  const code = (order.code as string) || String(order.id)
  const tickets = ticketsRes.docs.map((d, i) => ({
    token: d.token as string,
    type: ((d.type as string) === 'child' ? 'child' : 'adult') as 'adult' | 'child',
    ref: `${code}-${i + 1}`,
  }))

  const isoDate = show.date as string
  const date = typeof isoDate === 'string' ? isoDate.slice(0, 10) : ''
  const locale: 'en' | 'hr' =
    req.headers.get('x-locale') === 'hr' || req.cookies.get('moreska_locale')?.value === 'hr'
      ? 'hr'
      : 'en'

  const pdfBuffer = await renderTicketsPdf(
    {
      buyer: { name: (order.buyerName as string) ?? '' },
      show: { date, time: show.time, venue: show.venue },
      tickets,
      locale,
      orderRef: code,
    },
    { generateQrPng },
  )

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="moreska-tickets-${date || order.id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
