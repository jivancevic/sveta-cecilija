import { describe, expect, it, vi } from 'vitest'
import {
  CANCELLED_WINDOW_MS,
  attachArmyChips,
  attachOwnAnswers,
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

  it('splits at the real Zagreb offset on either side of the DST switch', () => {
    // Review fix on #426: with the old fixed +02:00 a November performance
    // resolved an hour early and dropped into "Prošle" while it was still
    // upcoming. Both halves of the year are asserted here.
    const summer = toRosterPerformance(doc({ id: 's', date: '2026-07-15', time: '20:00' }))
    const winter = toRosterPerformance(doc({ id: 'w', date: '2026-11-07', time: '20:00' }))
    expect(summer.startMs).toBe(Date.parse('2026-07-15T18:00:00Z'))
    expect(winter.startMs).toBe(Date.parse('2026-11-07T19:00:00Z'))
    for (const row of [summer, winter]) {
      // Same boundary as above: still upcoming at the start instant, past one
      // millisecond later.
      expect(splitSeasonPerformances([row], row.startMs).upcoming).toHaveLength(1)
      expect(splitSeasonPerformances([row], row.startMs + 1).past).toHaveLength(1)
    }
    // The switch day itself (2026-10-25) is already CET.
    const switchDay = toRosterPerformance(doc({ id: 'x', date: '2026-10-25', time: '20:00' }))
    expect(switchDay.startMs).toBe(Date.parse('2026-10-25T19:00:00Z'))
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

  it('is exactly seven days wide on the upcoming side', () => {
    const row = cancelled('edge', '2026-08-12')
    const insideNow = row.startMs - CANCELLED_WINDOW_MS
    expect(splitSeasonPerformances([row], insideNow).upcoming).toHaveLength(1)
    expect(splitSeasonPerformances([row], insideNow - 1).upcoming).toHaveLength(0)
  })

  it('is exactly seven days wide on the past side too', () => {
    const row = cancelled('edge', '2026-07-29')
    const lastMoment = row.startMs + CANCELLED_WINDOW_MS
    expect(splitSeasonPerformances([row], lastMoment).past).toHaveLength(1)
    expect(splitSeasonPerformances([row], lastMoment + 1).past).toHaveLength(0)
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

// ---------------------------------------------------------------------------
// The viewer's own answer on the card (#422).
// ---------------------------------------------------------------------------
describe('attachOwnAnswers', () => {
  const upcoming = toRosterPerformance(doc({ id: '1', date: '2026-08-20', time: '21:00' }))
  const started = toRosterPerformance(doc({ id: '2', date: '2026-08-01', time: '21:00' }))
  const cancelled = toRosterPerformance(
    doc({ id: '3', date: '2026-08-20', time: '21:00', status: 'cancelled' }),
  )
  const now = at('2026-08-05', '12:00')

  it('folds an answer onto its own performance and leaves the rest at null', () => {
    const out = attachOwnAnswers([upcoming, started], new Map([['1', 'coming']]), now, {
      voditelj: false,
      hasMember: true,
    })
    expect(out.map((p) => p.myAnswer)).toEqual(['coming', null])
  })

  it('lets a moreškant answer an upcoming performance only', () => {
    const out = attachOwnAnswers([upcoming, started, cancelled], new Map(), now, {
      voditelj: false,
      hasMember: true,
    })
    expect(out.map((p) => p.canAnswer)).toEqual([true, false, false])
  })

  it('lets a voditelj answer anything, started or cancelled', () => {
    const out = attachOwnAnswers([upcoming, started, cancelled], new Map(), now, {
      voditelj: true,
      hasMember: true,
    })
    expect(out.every((p) => p.canAnswer)).toBe(true)
  })

  it('a viewer with no Member answers nothing', () => {
    const out = attachOwnAnswers([upcoming], new Map(), now, { voditelj: true, hasMember: false })
    expect(out[0].canAnswer).toBe(false)
  })
})

describe('loadSeasonPerformances — own answers', () => {
  const shows = [doc({ id: 1, date: '2026-08-20' }), doc({ id: 2, date: '2026-08-25' })]

  /** Two collections, one injected `find`. */
  const findFor = (attendance: Record<string, unknown>[]) =>
    vi.fn(async (args: { collection?: string }) =>
      args.collection === 'attendance' ? { docs: attendance } : { docs: shows },
    )

  it('asks only for the viewer\'s own rows and folds them in', async () => {
    const f = findFor([{ performance: 1, member: 3, status: 'coming' }])
    const out = await loadSeasonPerformances({
      find: f,
      memberId: '3',
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    const attendanceCall = f.mock.calls.find((c) => c[0].collection === 'attendance')?.[0] as
      | { where?: unknown }
      | undefined
    expect(attendanceCall?.where).toEqual({ member: { equals: '3' } })
    expect(out.upcoming.find((p) => p.id === '1')?.myAnswer).toBe('coming')
    expect(out.upcoming.find((p) => p.id === '2')?.myAnswer).toBeNull()
  })

  it('does not query attendance at all for a viewer with no Member link', async () => {
    const f = findFor([])
    await loadSeasonPerformances({ find: f, now: () => new Date('2026-08-05T10:00:00.000Z') })
    expect(f.mock.calls.every((c) => c[0].collection === 'shows')).toBe(true)
  })

  it('reads the performance id through a populated relationship too', async () => {
    const f = findFor([{ performance: { id: 2 }, member: { id: 3 }, status: 'not_coming' }])
    const out = await loadSeasonPerformances({
      find: f,
      memberId: '3',
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    expect(out.upcoming.find((p) => p.id === '2')?.myAnswer).toBe('not_coming')
  })

  it('carries the per-army thresholds the count needs', async () => {
    const f = findFor([])
    const out = await loadSeasonPerformances({
      find: f,
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    expect(out.upcoming[0]).toMatchObject({ thresholdCrni: 8, thresholdBili: 8 })
  })
})

// ---------------------------------------------------------------------------
// The voditelj's headcount chip (#423, story 10).
// ---------------------------------------------------------------------------
describe('attachArmyChips', () => {
  const rows = [
    toRosterPerformance(doc({ id: '1', date: '2026-08-20', thresholdCrni: 2, thresholdBili: 1 })),
    toRosterPerformance(doc({ id: '2', date: '2026-08-25', thresholdCrni: 2, thresholdBili: 1 })),
  ]
  const members = [
    { id: '1', nickname: 'Cici', roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true },
    { id: '2', nickname: 'Bepo', roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true },
    { id: '3', nickname: 'Dado', roles: ['bili'], primaryRole: 'bili', active: true, isMoreskant: true },
  ]

  it('counts each performance separately against its own thresholds', () => {
    const out = attachArmyChips(
      rows,
      [
        { performanceId: '1', memberId: '1', status: 'coming', army: 'crni' },
        { performanceId: '1', memberId: '2', status: 'coming', army: 'crni' },
        { performanceId: '1', memberId: '3', status: 'coming', army: 'bili' },
        { performanceId: '2', memberId: '1', status: 'coming', army: 'crni' },
      ],
      members,
    )
    expect(out[0].chip).toEqual({
      crni: { count: 2, threshold: 2, below: false },
      bili: { count: 1, threshold: 1, below: false },
    })
    expect(out[1].chip).toEqual({
      crni: { count: 1, threshold: 2, below: true },
      bili: { count: 0, threshold: 1, below: true },
    })
  })

  it('turns from below-threshold to ok when the missing dancer answers', () => {
    const before = attachArmyChips(rows, [], members)
    expect(before[0].chip?.crni.below).toBe(true)
    const after = attachArmyChips(
      rows,
      [
        { performanceId: '1', memberId: '1', status: 'coming', army: 'crni' },
        { performanceId: '1', memberId: '2', status: 'coming', army: 'crni' },
      ],
      members,
    )
    expect(after[0].chip?.crni.below).toBe(false)
  })

  it('never counts a not-coming answer', () => {
    const out = attachArmyChips(
      rows,
      [{ performanceId: '1', memberId: '1', status: 'not_coming', army: 'crni' }],
      members,
    )
    expect(out[0].chip?.crni.count).toBe(0)
  })
})

describe('loadSeasonPerformances — the chip is the voditelj\'s only', () => {
  const shows = [doc({ id: 1, date: '2026-08-20' })]
  const findFor = () =>
    vi.fn(async (args: { collection?: string }) => {
      if (args.collection === 'attendance') {
        return { docs: [{ performance: 1, member: 3, status: 'coming', army: 'crni' }] }
      }
      if (args.collection === 'members') {
        return {
          docs: [
            { id: 3, nickname: 'Cici', roles: ['crni'], primaryRole: 'crni', active: true, isMoreskant: true },
          ],
        }
      }
      return { docs: shows }
    })

  it('attaches a chip for a voditelj', async () => {
    const out = await loadSeasonPerformances({
      find: findFor(),
      voditelj: true,
      memberId: '3',
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    expect(out.upcoming[0].chip).toEqual({
      crni: { count: 1, threshold: 8, below: true },
      bili: { count: 0, threshold: 8, below: true },
    })
  })

  it('attaches none for a moreškant, and asks for no roster', async () => {
    const f = findFor()
    const out = await loadSeasonPerformances({
      find: f,
      memberId: '3',
      now: () => new Date('2026-08-05T10:00:00.000Z'),
    })
    expect(out.upcoming[0].chip).toBeNull()
    expect(f.mock.calls.some((c) => c[0].collection === 'members')).toBe(false)
  })
})
