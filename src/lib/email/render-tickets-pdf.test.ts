import { describe, it, expect } from 'vitest'
import { __test__, renderTicketsPdf, type RenderTicketsPdfTicket } from './render-tickets-pdf'

const { formatDate, typePriceLabel, chunkPairs, priceEur, COPY, VENUE_LABEL } = __test__

// 1x1 transparent PNG, a stand-in QR so the renderer has a decodable image.
const STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function tickets(n: number): RenderTicketsPdfTicket[] {
  return Array.from({ length: n }, (_, i) => ({
    token: `tok_${i + 1}`,
    type: i % 2 === 0 ? 'adult' : 'child',
    ref: `AB23-${i + 1}`,
  }))
}

describe('formatDate', () => {
  it('formats EN and HR long dates from an ISO day', () => {
    expect(formatDate('2026-07-15', 'en')).toBe('Wednesday, 15 July 2026')
    // Croatian long date (locale-dependent wording; assert key parts)
    const hr = formatDate('2026-07-15', 'hr')
    expect(hr).toContain('2026')
    expect(hr.toLowerCase()).toContain('srpnja')
  })
})

describe('priceEur', () => {
  it('is €20 adult / €10 child', () => {
    expect(priceEur('adult')).toBe(20)
    expect(priceEur('child')).toBe(10)
  })
})

describe('typePriceLabel', () => {
  it('renders type + face price per locale', () => {
    expect(typePriceLabel('adult', 'en')).toBe('Adult · €20')
    expect(typePriceLabel('child', 'en')).toBe('Child · €10')
    expect(typePriceLabel('adult', 'hr')).toBe('Odrasli · €20')
    expect(typePriceLabel('child', 'hr')).toBe('Dijete · €10')
  })
})

describe('chunkPairs', () => {
  it('groups into pages of two (2-up A5 layout)', () => {
    expect(chunkPairs([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]])
  })
  it('leaves a single trailing ticket on its own page', () => {
    expect(chunkPairs([1, 2, 3])).toEqual([[1, 2], [3]])
  })
  it('handles one ticket and empty input', () => {
    expect(chunkPairs([1])).toEqual([[1]])
    expect(chunkPairs([])).toEqual([])
  })
})

describe('copy + venue tables stay structurally parallel', () => {
  it('EN and HR expose the same keys', () => {
    expect(Object.keys(COPY.en).sort()).toEqual(Object.keys(COPY.hr).sort())
  })
  it('maps both venues in both locales', () => {
    expect(VENUE_LABEL.en['ljetno-kino']).toMatch(/Summer Cinema/)
    expect(VENUE_LABEL.hr['zimsko-kino']).toMatch(/Centar za kulturu/)
  })
})

describe('renderTicketsPdf (real react-pdf render)', () => {
  const baseInput = {
    buyer: { name: 'Ana Anić' },
    show: { date: '2026-07-15', time: '21:00', venue: 'ljetno-kino' as const },
    orderRef: 'AB23',
  }
  const countPages = (buf: Buffer) =>
    (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length

  // Generous timeout: react-pdf font registration + layout is slow on cold start.
  it('renders a valid 3-page PDF for a party of 5 (EN), one QR per person', async () => {
    let qrCalls = 0
    const buf = await renderTicketsPdf(
      { ...baseInput, tickets: tickets(5), locale: 'en' },
      { generateQrPng: async () => { qrCalls++; return STUB_PNG } },
    )
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(2000)
    expect(countPages(buf)).toBe(3) // 5 tickets, 2 per page
    expect(qrCalls).toBe(5) // one QR per person
  }, 30000)

  it('renders a single-ticket one-page PDF in HR', async () => {
    const buf = await renderTicketsPdf(
      { ...baseInput, tickets: tickets(1), locale: 'hr' },
      { generateQrPng: async () => STUB_PNG },
    )
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(countPages(buf)).toBe(1)
  }, 30000)
})
