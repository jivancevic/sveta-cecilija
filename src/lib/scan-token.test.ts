import { describe, it, expect, vi } from 'vitest'
import {
  scanToken,
  canUndoScan,
  undoScan,
  UNDO_WINDOW_MS,
  type ScanDeps,
} from './scan-token'

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

  it('canUndoScan: true when scannedAt is within the 2-minute window', () => {
    const now = new Date('2026-05-24T19:01:00.000Z')
    const scannedAt = '2026-05-24T19:00:00.000Z'
    expect(canUndoScan(scannedAt, now)).toBe(true)
  })

  it('canUndoScan: false when scannedAt is older than the window', () => {
    const now = new Date('2026-05-24T19:05:00.000Z')
    const scannedAt = '2026-05-24T19:00:00.000Z'
    expect(canUndoScan(scannedAt, now)).toBe(false)
  })

  it('canUndoScan: false when scannedAt is empty/missing', () => {
    expect(canUndoScan('', new Date())).toBe(false)
  })

  it('UNDO_WINDOW_MS is 2 minutes', () => {
    expect(UNDO_WINDOW_MS).toBe(2 * 60 * 1000)
  })

  it('undoScan returns UNDONE and passes the configured window to atomicUndo', async () => {
    const atomicUndo = vi.fn().mockResolvedValue(true)
    const result = await undoScan('tok_abc', { atomicUndo })
    expect(result).toEqual({ status: 'UNDONE' })
    expect(atomicUndo).toHaveBeenCalledWith('tok_abc', UNDO_WINDOW_MS)
  })

  it('undoScan returns REJECTED when atomicUndo flipped no rows (out of window or already-undone)', async () => {
    const atomicUndo = vi.fn().mockResolvedValue(false)
    const result = await undoScan('tok_abc', { atomicUndo })
    expect(result).toEqual({ status: 'REJECTED' })
  })

  it('undoScan honours a custom windowMs option', async () => {
    const atomicUndo = vi.fn().mockResolvedValue(true)
    await undoScan('tok_abc', { atomicUndo }, { windowMs: 5_000 })
    expect(atomicUndo).toHaveBeenCalledWith('tok_abc', 5_000)
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
