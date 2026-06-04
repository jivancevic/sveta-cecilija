import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { signTicketLink } from '@/lib/ticket-link'
import { renderTicketsPdf } from '@/lib/email/render-tickets-pdf'

// Mock Payload + the heavy PDF/QR renderers so the test exercises only the
// auth gate. render-tickets-pdf otherwise pulls in @react-pdf/renderer and
// reads a logo PNG at module load.
const auth = vi.fn()
const findByID = vi.fn()
const find = vi.fn()

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth, findByID, find })),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/email/render-tickets-pdf', () => ({
  renderTicketsPdf: vi.fn(async () => Buffer.from('%PDF-1.4 fake')),
}))
vi.mock('@/lib/email/qr', () => ({ generateQrPng: vi.fn(async () => Buffer.from('png')) }))

import { GET } from './route'

const ORDER = {
  id: 42,
  email: 'buyer@example.com',
  code: 'AB23',
  buyerName: 'Ana',
  adultCount: 2,
  childCount: 0,
  partner: null,
  show: { date: '2026-07-01T00:00:00.000Z', time: '21:30', venue: 'ljetno-kino' },
}

function req(query: string) {
  return new NextRequest(`http://localhost/api/orders/42/tickets.pdf${query}`)
}
const params = Promise.resolve({ id: '42' })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TICKET_LINK_SECRET = 'test-secret-32-bytes-long-1234567890ab'
  findByID.mockResolvedValue(ORDER)
  auth.mockResolvedValue({ user: null }) // unauthenticated (no staff/partner session)
  find.mockResolvedValue({ docs: [{ token: 'qr-token-xyz' }] })
})

describe('GET /api/orders/[id]/tickets.pdf auth gate', () => {
  // ADR-0014 invariant: the order code is a display/support reference only and
  // must NEVER authorise the PDF endpoint. If a future change wires `?code=`
  // into auth, this test fails loudly.
  it('rejects a request authorised only by the order code', async () => {
    const res = await GET(req(`?code=${ORDER.code}`), { params })
    expect(res.status).toBe(401)
  })

  it('rejects a request with no credential at all', async () => {
    const res = await GET(req(''), { params })
    expect(res.status).toBe(401)
  })

  it('authorises a valid HMAC-signed link (control)', async () => {
    const t = signTicketLink({ orderId: '42', email: ORDER.email })
    const res = await GET(req(`?t=${t}`), { params })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
  })

  it('rejects a forged token even when the code is also supplied', async () => {
    const res = await GET(req(`?t=not-a-real-token&code=${ORDER.code}`), { params })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/orders/[id]/tickets.pdf partner-slip wiring', () => {
  const renderMock = vi.mocked(renderTicketsPdf)

  it('passes seller + showClaimPrompt for a partner order with no email', async () => {
    findByID.mockResolvedValue({
      ...ORDER,
      email: '',
      buyerName: '',
      channel: 'partner',
      partner: { id: 7, name: 'Adriatic DMC' },
    })
    const t = signTicketLink({ orderId: '42', email: ORDER.email })
    // No email on the order, so authorise via staff session instead.
    auth.mockResolvedValue({ user: { role: 'admin' } })
    const res = await GET(req(`?t=${t}`), { params })
    expect(res.status).toBe(200)
    const input = renderMock.mock.calls.at(-1)![0]
    expect(input.seller).toEqual({ name: 'Adriatic DMC' })
    expect(input.showClaimPrompt).toBe(true)
    expect(input.buyer.name).toBe('')
  })

  it('passes no seller and falsy showClaimPrompt for an online order with email', async () => {
    findByID.mockResolvedValue({ ...ORDER, channel: 'online' })
    const t = signTicketLink({ orderId: '42', email: ORDER.email })
    const res = await GET(req(`?t=${t}`), { params })
    expect(res.status).toBe(200)
    const input = renderMock.mock.calls.at(-1)![0]
    expect(input.seller).toBeUndefined()
    expect(input.showClaimPrompt).toBeFalsy()
  })

  it('falls back to fetching the partner name when partner is just an id', async () => {
    findByID.mockReset()
    // First call: the order (partner is a bare id). Second call: the partner lookup.
    findByID
      .mockResolvedValueOnce({
        ...ORDER,
        email: '',
        buyerName: '',
        channel: 'partner',
        partner: 7,
      })
      .mockResolvedValueOnce({ id: 7, name: 'Gulliver Travel' })
    auth.mockResolvedValue({ user: { role: 'admin' } })
    const res = await GET(req(''), { params })
    expect(res.status).toBe(200)
    const input = renderMock.mock.calls.at(-1)![0]
    expect(input.seller).toEqual({ name: 'Gulliver Travel' })
    expect(input.showClaimPrompt).toBe(true)
  })
})
