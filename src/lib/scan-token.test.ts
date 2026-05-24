import { describe, it, expect, vi } from 'vitest'
import { scanToken, type ScanDeps } from './scan-token'

function makeDeps(overrides: Partial<ScanDeps> = {}): ScanDeps {
  return {
    atomicMarkScanned: vi.fn().mockResolvedValue(null),
    findScannedToken: vi.fn().mockResolvedValue(null),
    findOrderDetails: vi.fn().mockResolvedValue(null),
    findShowDetails: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe('scanToken', () => {
  it('returns INVALID for an unknown token', async () => {
    const result = await scanToken('nope', makeDeps())
    expect(result).toEqual({ status: 'INVALID' })
  })

  it('buyer view returns ticket details without marking the token scanned', async () => {
    const atomicMarkScanned = vi.fn().mockResolvedValue(null)
    const deps = makeDeps({
      atomicMarkScanned,
      findScannedToken: vi
        .fn()
        .mockResolvedValue({ orderId: 'ord_1', scannedAt: '' }),
      findOrderDetails: vi.fn().mockResolvedValue({
        buyerName: 'Ana',
        adultCount: 2,
        childCount: 1,
        showId: 'show_1',
      }),
      findShowDetails: vi.fn().mockResolvedValue({
        date: '2026-07-01',
        time: '21:00',
        venue: 'ljetno-kino',
      }),
    })
    const result = await scanToken('tok_abc', deps, { viewer: 'buyer' })
    expect(result).toEqual({
      status: 'BUYER_VIEW',
      token: 'tok_abc',
      buyerName: 'Ana',
      adultCount: 2,
      childCount: 1,
      showDate: '2026-07-01',
      showTime: '21:00',
      venue: 'ljetno-kino',
    })
    expect(atomicMarkScanned).not.toHaveBeenCalled()
  })

  it('buyer view of unknown token returns INVALID without marking', async () => {
    const atomicMarkScanned = vi.fn().mockResolvedValue(null)
    const deps = makeDeps({ atomicMarkScanned })
    const result = await scanToken('nope', deps, { viewer: 'buyer' })
    expect(result).toEqual({ status: 'INVALID' })
    expect(atomicMarkScanned).not.toHaveBeenCalled()
  })

  it('buyer view does not leak that the token has already been scanned', async () => {
    const deps = makeDeps({
      findScannedToken: vi
        .fn()
        .mockResolvedValue({ orderId: 'ord_1', scannedAt: '2026-05-23T18:30:00.000Z' }),
      findOrderDetails: vi.fn().mockResolvedValue({
        buyerName: 'Ana',
        adultCount: 2,
        childCount: 1,
        showId: 'show_1',
      }),
      findShowDetails: vi.fn().mockResolvedValue({
        date: '2026-07-01',
        time: '21:00',
        venue: 'ljetno-kino',
      }),
    })
    const result = await scanToken('tok_abc', deps, { viewer: 'buyer' })
    expect(result.status).toBe('BUYER_VIEW')
    expect(JSON.stringify(result)).not.toContain('2026-05-23')
    expect(JSON.stringify(result)).not.toContain('ALREADY')
  })

  it('returns VALID with buyer + show details on the first scan', async () => {
    const deps = makeDeps({
      atomicMarkScanned: vi
        .fn()
        .mockResolvedValue({ orderId: 'ord_1', scannedAt: '2026-05-24T19:00:00.000Z' }),
      findOrderDetails: vi.fn().mockResolvedValue({
        buyerName: 'Ana',
        adultCount: 2,
        childCount: 1,
        showId: 'show_1',
      }),
      findShowDetails: vi.fn().mockResolvedValue({
        date: '2026-07-01',
        time: '21:00',
        venue: 'ljetno-kino',
      }),
    })
    const result = await scanToken('tok_abc', deps)
    expect(result).toEqual({
      status: 'VALID',
      buyerName: 'Ana',
      adultCount: 2,
      childCount: 1,
      showDate: '2026-07-01',
      showTime: '21:00',
      venue: 'ljetno-kino',
    })
  })

  it('returns ALREADY_SCANNED with original timestamp + show details when the token was previously scanned', async () => {
    const deps = makeDeps({
      atomicMarkScanned: vi.fn().mockResolvedValue(null),
      findScannedToken: vi
        .fn()
        .mockResolvedValue({ orderId: 'ord_1', scannedAt: '2026-05-23T18:30:00.000Z' }),
      findOrderDetails: vi.fn().mockResolvedValue({
        buyerName: 'Ana',
        adultCount: 2,
        childCount: 1,
        showId: 'show_1',
      }),
      findShowDetails: vi.fn().mockResolvedValue({
        date: '2026-07-01',
        time: '21:00',
        venue: 'ljetno-kino',
      }),
    })
    const result = await scanToken('tok_abc', deps)
    expect(result).toEqual({
      status: 'ALREADY_SCANNED',
      scannedAt: '2026-05-23T18:30:00.000Z',
      showDate: '2026-07-01',
      showTime: '21:00',
      venue: 'ljetno-kino',
    })
  })
})
