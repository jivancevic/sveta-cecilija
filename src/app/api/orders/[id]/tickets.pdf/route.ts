import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { renderTicketsPdf } from '@/lib/email/render-tickets-pdf'
import { generateQrPng } from '@/lib/email/qr'
import { verifyTicketLink } from '@/lib/ticket-link'
import { isAuthed } from '@/lib/access/roles'
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
    if (isAuthed(user as { role?: string } | null)) authorized = true
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

  // One QR token per order since #93 — fetch the single token row.
  const tokensRes = await payload.find({
    collection: 'qr-tokens',
    where: { order: { equals: order.id } },
    limit: 1,
    depth: 0,
    sort: 'createdAt',
  })
  const tokenRow = tokensRes.docs[0]
  if (!tokenRow) {
    return NextResponse.json({ error: 'No ticket for this order' }, { status: 404 })
  }
  const token = tokenRow.token as string

  const isoDate = show.date as string
  const date = typeof isoDate === 'string' ? isoDate.slice(0, 10) : ''
  const locale: 'en' | 'hr' =
    req.headers.get('x-locale') === 'hr' || req.cookies.get('moreska_locale')?.value === 'hr'
      ? 'hr'
      : 'en'

  const pdfBuffer = await renderTicketsPdf(
    {
      buyer: { name: order.buyerName as string },
      show: { date, time: show.time, venue: show.venue },
      order: {
        adultCount: (order.adultCount as number) ?? 0,
        childCount: (order.childCount as number) ?? 0,
      },
      token,
      locale,
      orderRef: String(order.id),
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
