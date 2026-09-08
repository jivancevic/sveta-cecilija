import { describe, expect, it, vi } from 'vitest'
import {
  CANCELLED_WINDOW_MS,
  loadSeasonPerformances,
  splitSeasonPerformances,
  toRosterPerformance,
} from './roster-loaders'
import { showStartMs } from '@/lib/show-time'

/** A raw Payload doc, the shape `payload.find({collection:'shows'})` returns. */
function doc(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: '2026-08-05T00:00:00.000Z',
    time: '21:00',
    kind: 'redovna',
    isPublic: true,
    venue: 'ljetno-kino',
    status: 'active',
    thresholdCrni: 8,
    thresholdBili: 8,
    voditeljNote: 'Nalazimo se u 20:30.',
    ...over,
  }
}

const at = (date: string, time: string) => showStartMs(date, time)

describe('toRosterPerformance', () => {
  it('shapes a public performance around its venue', () => {
    const p = toRosterPerformance(doc())
    expect(p).toMatchObject({
      id: '1',
      date: '2026-08-05',
      time: '21:00',
      kind: 'redovna',
      isPublic: true,
      venue: 'ljetno-kino',
      location: null,
      client: null,
      cancelled: false,
      voditeljNote: 'Nalazimo se u 20:30.',
    })
    expect(p.startMs).toBe(at('2026-08-05', '21:00'))
  })

  it('shapes a non-public performance around its location and client', () => {
    const p = toRosterPerformance(
      doc({
        isPublic: false,
        kind: 'dmc',
        venue: null,
        location: 'Zimsko kino',
        client: 'Le Ponant',
        time: '10:00',
      }),
    )
    expect(p).toMatchObject({
      isPublic: false,
      kind: 'dmc',
      venue: null,
      location: 'Zimsko kino',
      client: 'Le Ponant',
    })
  })

  it('never carries a venue on a non-public row, even if the column holds one', () => {
    const p = toRosterPerformance(doc({ isPublic: false, venue: 'ljetno-kino', location: 'Luka' }))
    expect(p.venue).toBeNull()
  })

  it('blanks an empty note, location and client rather than rendering whitespace', () => {
    const p = toRosterPerformance(doc({ voditeljNote: '   ', isPublic: false, location: '  ', client: '' }))
    expect(p.voditeljNote).toBeNull()
    expect(p.location).toBeNull()
    expect(p.client).toBeNull()
  })

  it('marks a cancelled row', () => {
    expect(toRosterPerformance(doc({ status: 'cancelled' })).cancelled).toBe(true)
  })

  // The PII boundary of ADR-0024: mobiles are shared inside the app, emails are
  // not. The contract carries no email at all, so no template can leak one.
  it('carries no email under any key, whatever the row holds', () => {
    const serialised = JSON.stringify(
      toRosterPerformance(doc({ email: 'buyer@example.com', buyerEmail: 'x@y.z' })),
    )
    expect(serialised.toLowerCase()).not.toContain('email')
    expect(serialised).not.toContain('example.com')
  })
})

describe('splitSeasonPerformances — the Zagreb boundary', () => {
  const evening = toRosterPerformance(doc({ id: 1, date: '2026-08-05', time: '21:00' }))
  const morning = toRosterPerformance(
    doc({ id: 2, date: '2026-08-05', time: '10:00', isPublic: false, location: 'Luka' }),
  )

  it('keeps tonight’s 21:00 show upcoming all afternoon', () => {
    const { upcoming, past } = splitSeasonPerformances(
      [evening, morning],
      at('2026-08-05', '17:00'),
    )
    expect(upcoming.map((p) => p.id)).toEqual(['1'])
    expect(past.map((p) => p.id)).toEqual(['2'])
  })

  it('moves a performance to past the moment it starts (no grace window)', () => {
    const exactly = at('2026-08-05', '21:00')
    expect(splitSeasonPerformances([evening], exactly).upcoming).toHaveLength(1)
    expect(splitSeasonPerformances([evening], exactly + 1).past).toHaveLength(1)
    // The buyer path keeps a show listed for an hour (SHOW_GRACE_MS); the
    // roster deliberately does not.
    expect(splitSeasonPerformances([evening], exactly + 60 * 60 * 1000).upcoming).toHaveLength(0)
  })

  it('splits at the Zagreb wall clock, not at UTC midnight', () => {
    // 2026-08-05 22:30 UTC is already 2026-08-06 00:30 in Zagreb, so a 23:00
    // Zagreb performance on the 5th is past even though the UTC day has not
    // turned.
    const late = toRosterPerformance(doc({ id: 3, date: '2026-08-05', time: '23:00' }))
    const nowUtc = Date.parse('2026-08-05T22:30:00.000Z')
    expect(splitSeasonPerformances([late], nowUtc).past.map((p) => p.id)).toEqual(['3'])
  })
})

describe('splitSeasonPerformances — ordering', () => {
  const rows = [
    toRosterPerformance(doc({ id: 'c', date: '2026-08-20', time: '21:00' })),
    toRosterPerformance(doc({ id: 'a', date: '2026-06-01', time: '21:00' })),
    toRosterPerformance(doc({ id: 'b', date: '2026-08-05', time: '21:00' })),
    toRosterPerformance(doc({ id: 'b2', date: '2026-08-05', time: '10:00' })),
  ]

  it('runs upcoming soonest first and past most recent first', () => {
    const { upcoming, past } = splitSeasonPerformances(rows, at('2026-08-05', '12:00'))
    expect(upcoming.map((p) => p.id)).toEqual(['b', 'c'])
    expect(past.map((p) => p.id)).toEqual(['b2', 'a'])
  })

  it('orders two performances on the same day by their time', () => {
    const { upcoming } = splitSeasonPerformances(rows, at('2026-06-01', '00:00'))
    expect(upcoming.map((p) => p.id)).toEqual(['a', 'b2', 'b', 'c'])
  })
})

describe('splitSeasonPerformances — the ±7-day cancelled window', () => {
  const now = at('2026-08-05', '12:00')
  const cancelled = (id: string, date: string) =>
    toRosterPerformance(doc({ id, date, time: '21:00', status: 'cancelled' }))

  it('shows a cancellation inside the window, in the half its start puts it', () => {
    const { upcoming, past } = splitSeasonPerformances(
      [cancelled('soon', '2026-08-08'), cancelled('justwas', '2026-08-02')],
      now,
    )
    expect(upcoming.map((p) => p.id)).toEqual(['soon'])
    expect(past.map((p) => p.id)).toEqual(['justwas'])
    expect([...upcoming, ...past].every((p) => p.cancelled)).toBe(true)
  })

  it('hides a cancellation outside the window in either direction', () => {
    const { upcoming, past } = splitSeasonPerformances(
      [cancelled('far', '2026-09-20'), cancelled('longgone', '2026-06-01')],
      now,
    )
    expect(upcoming).toEqual([])
    expect(past).toEqual([])
  })

  it('is exactly seven days wide', () => {
    const row = cancelled('edge', '2026-08-12')
    const insideNow = row.startMs - CANCELLED_WINDOW_MS
    expect(splitSeasonPerformances([row], insideNow).upcoming).toHaveLength(1)
    expect(splitSeasonPerformances([row], insideNow - 1).upcoming).toHaveLength(0)
  })

  it('never hides an ACTIVE performance, however far away', () => {
    const far = toRosterPerformance(doc({ id: 'far', date: '2026-10-14', time: '21:00' }))
    expect(splitSeasonPerformances([far], now).upcoming.map((p) => p.id)).toEqual(['far'])
  })
})

describe('loadSeasonPerformances', () => {
  const find = (docs: Record<string, unknown>[]) => vi.fn().mockResolvedValue({ docs })

  it('asks for the whole calendar year of the current season, every kind', async () => {
    const f = find([])
    await loadSeasonPerformances({ find: f, now: () => new Date('2026-08-05T10:00:00.000Z') })
    const args = f.mock.calls[0][0]
    expect(args.collection).toBe('shows')
    expect(args.where).toEqual({
      and: [
        { date: { greater_than_equal: '2026-01-01T00:00:00.000Z' } },
        { date: { less_than: '2027-01-01T00:00:00.000Z' } },
      ],
    })
    // No public filter: the roster covers a ship call as much as a Redovna.
    expect(JSON.stringify(args.where)).not.toContain('isPublic')
  })

  it('returns the season year alongside the two halves', async () => {
    const result = await loadSeasonPerformances({
      find: find([
        doc({ id: 1, date: '2026-08-20' }),
        doc({ id: 2, date: '2026-06-01', isPublic: false, kind: 'gulliver', location: 'Luka' }),
      ]),
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    expect(result.year).toBe(2026)
    expect(result.upcoming.map((p) => p.id)).toEqual(['1'])
    expect(result.past.map((p) => p.id)).toEqual(['2'])
  })

  it('leaks no email through the loaded payload either', async () => {
    const result = await loadSeasonPerformances({
      find: find([doc({ id: 1, email: 'someone@example.com' })]),
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    expect(JSON.stringify(result).toLowerCase()).not.toContain('email')
  })

  it('reads the season off the Zagreb calendar year (New Year’s Eve)', async () => {
    const f = find([])
    // 31 Dec 2026 23:30 UTC is already 1 Jan 2027 in Zagreb.
    await loadSeasonPerformances({ find: f, now: () => new Date('2026-12-31T23:30:00.000Z') })
    expect(f.mock.calls[0][0].where.and[0]).toEqual({
      date: { greater_than_equal: '2027-01-01T00:00:00.000Z' },
    })
  })
})
