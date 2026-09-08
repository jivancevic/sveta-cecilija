// The MCP tool surface, driven through a fake store (#438).
//
// Every assertion is on what a tool ANSWERED and what the store was asked to
// write, never on which internal function ran: the acceptance criteria are
// "`Ćići` matches `cici`", "unmatched names come back", "a confirmed postava
// refuses" and "what is written is unconfirmed", and each of those is
// observable from outside.

import { describe, expect, it } from 'vitest'
import {
  createPerformances,
  isRealCalendarDay,
  getPerformance,
  listMoreskanti,
  listPerformances,
  nicknameMatchKey,
  setLineup,
  type McpAttendanceRow,
  type McpLineupRow,
  type McpMoreskant,
  type McpPerformance,
  type McpStore,
} from './tools'
import type { AttendanceMember } from '@/lib/attendance/rules'
import type { LineupEntry } from '@/lib/lineup/rules'

const ROSTER: AttendanceMember[] = [
  { id: '1', name: 'Ivan Fabris', nickname: 'Ćići', roles: ['crni', 'crni_kralj'], primaryRole: 'crni_kralj' },
  { id: '2', name: 'Josip Bepo', nickname: 'Bepo', roles: ['bili'], primaryRole: 'bili' },
  { id: '3', name: 'Đuro Mali', nickname: 'Đuro', roles: ['crni'], primaryRole: 'crni' },
]

function performance(over: Partial<McpPerformance> = {}): McpPerformance {
  return {
    id: '10',
    date: '2026-08-05',
    time: '21:00',
    kind: 'redovna',
    isPublic: true,
    place: 'Ljetno kino',
    cancelled: false,
    note: null,
    lineupConfirmed: false,
    thresholdCrni: 8,
    thresholdBili: 8,
    ...over,
  }
}

interface FakeOptions {
  performances?: McpPerformance[]
  roster?: AttendanceMember[]
  moreskanti?: McpMoreskant[]
  attendance?: McpAttendanceRow[]
  lineup?: McpLineupRow[]
  confirmedRace?: boolean
}

function fakeStore(opts: FakeOptions = {}) {
  const performances = opts.performances ?? [performance()]
  const replaced: { performanceId: string; entries: LineupEntry[] }[] = []
  const createdBatches: { dateStr: string; data: Record<string, unknown> }[][] = []

  const store: McpStore = {
    listPerformances: async () => performances,
    getPerformance: async (id) => performances.find((p) => p.id === id) ?? null,
    loadRoster: async () => opts.roster ?? ROSTER,
    listMoreskanti: async () => opts.moreskanti ?? [],
    attendanceRows: async (ids) =>
      (opts.attendance ?? []).filter((r) => ids.includes(r.performanceId)),
    lineupFor: async () => opts.lineup ?? [],
    replaceLineup: async (performanceId, entries) => {
      if (opts.confirmedRace) return { written: false, reason: 'confirmed' }
      replaced.push({ performanceId, entries: [...entries] })
      return { written: true }
    },
    createPerformances: async (rows) => {
      createdBatches.push(rows)
      return { created: rows.map((r) => r.dateStr) }
    },
  }
  return { store, replaced, createdBatches }
}

describe('nicknameMatchKey', () => {
  it('folds case and Croatian diacritics, which is the whole matching rule', () => {
    expect(nicknameMatchKey('Ćići')).toBe(nicknameMatchKey('cici'))
    expect(nicknameMatchKey(' CICI ')).toBe(nicknameMatchKey('Ćići'))
    expect(nicknameMatchKey('Đuro')).toBe('djuro')
    expect(nicknameMatchKey('Žuti')).toBe('zuti')
  })

  it('keeps two different nicknames different', () => {
    expect(nicknameMatchKey('Cici')).not.toBe(nicknameMatchKey('Bepo'))
  })

  it('does NOT fall back to the word "moreskant" for a symbol-only nickname (#445 review)', () => {
    // usernameFromNickname would answer `moreskant` here, which as a MATCH key
    // would make every symbol-only name the same person.
    expect(nicknameMatchKey('###')).toBe('')
    expect(nicknameMatchKey('!!!')).toBe('')
    expect(nicknameMatchKey('Moreškant')).toBe('moreskant')
  })
})

describe('isRealCalendarDay', () => {
  it('accepts days that exist', () => {
    expect(isRealCalendarDay('2027-05-04')).toBe(true)
    expect(isRealCalendarDay('2028-02-29')).toBe(true) // a leap year
  })

  it('refuses days that V8 would silently roll forward', () => {
    expect(isRealCalendarDay('2026-02-31')).toBe(false)
    expect(isRealCalendarDay('2027-02-29')).toBe(false) // not a leap year
    expect(isRealCalendarDay('2027-04-31')).toBe(false)
    expect(isRealCalendarDay('2027-13-01')).toBe(false)
    expect(isRealCalendarDay('2027-00-10')).toBe(false)
    expect(isRealCalendarDay('2027-05-00')).toBe(false)
    expect(isRealCalendarDay('4.5.2027.')).toBe(false)
  })
})

describe('list_performances', () => {
  it('defaults to the current season and counts the armies', async () => {
    const { store } = fakeStore({
      attendance: [
        { performanceId: '10', memberId: '1', status: 'coming', army: 'crni' },
        { performanceId: '10', memberId: '2', status: 'coming', army: 'bili' },
      ],
    })
    const res = await listPerformances({}, store, () => new Date('2026-08-01T10:00:00Z'))
    expect(res).toMatchObject({ ok: true, season: 2026 })
    if (!res.ok) throw new Error('unreachable')
    expect(res.performances[0]!.armies).toEqual({ crni: 1, bili: 1, noAnswer: 1 })
  })

  it('takes an explicit season and refuses one that is not a year', async () => {
    const { store } = fakeStore()
    const ok = await listPerformances({ season: '2025' }, store)
    expect(ok).toMatchObject({ ok: true, season: 2025 })
    expect(await listPerformances({ season: 'lani' }, store)).toMatchObject({ ok: false })
  })

  it('answers an empty season with an empty list, not an error', async () => {
    const { store } = fakeStore({ performances: [] })
    const res = await listPerformances({ season: 1999 }, store)
    expect(res).toMatchObject({ ok: true, performances: [] })
  })
})

describe('get_performance', () => {
  it('returns the evening, the answers, the silent and the postava in reading order', async () => {
    const { store } = fakeStore({
      attendance: [
        { performanceId: '10', memberId: '2', status: 'coming', army: 'bili' },
        { performanceId: '10', memberId: '3', status: 'not_coming', army: null },
      ],
      lineup: [
        { memberId: '2', role: 'bili' },
        { memberId: '1', role: 'crni_kralj' },
      ],
    })
    const res = await getPerformance({ id: '10' }, store)
    if (!res.ok) throw new Error(res.error)
    expect(res.performance.id).toBe('10')
    expect(res.attendance.map((a) => `${a.nickname}:${a.status}`)).toEqual([
      'Bepo:coming',
      'Đuro:not_coming',
    ])
    expect(res.noAnswer).toEqual(['Ćići'])
    // Kings before the plain armies, never alphabetical.
    expect(res.lineup.entries.map((e) => e.nickname)).toEqual(['Ćići', 'Bepo'])
    expect(res.lineup.confirmed).toBe(false)
  })

  it('refuses an unknown id and a missing one', async () => {
    const { store } = fakeStore()
    expect(await getPerformance({ id: '999' }, store)).toMatchObject({ ok: false })
    expect(await getPerformance({}, store)).toMatchObject({ ok: false })
  })
})

describe('list_moreskanti', () => {
  it('sorts by nickname and carries no mobile or e-mail', async () => {
    const moreskanti: McpMoreskant[] = [
      { id: '2', nickname: 'Bepo', name: 'Josip Bepo', active: true, roles: ['bili'], primaryRole: 'bili', hasLogin: false },
      { id: '1', nickname: 'Ćići', name: 'Ivan Fabris', active: true, roles: ['crni'], primaryRole: 'crni', hasLogin: true },
    ]
    const { store } = fakeStore({ moreskanti })
    const res = await listMoreskanti(store)
    if (!res.ok) throw new Error(res.error)
    expect(res.moreskanti.map((m) => m.nickname)).toEqual(['Bepo', 'Ćići'])
    for (const m of res.moreskanti) {
      expect(Object.keys(m)).not.toContain('mobile')
      expect(Object.keys(m)).not.toContain('email')
    }
  })
})

describe('set_lineup', () => {
  it('matches ignoring case and diacritics and writes what it matched', async () => {
    const { store, replaced } = fakeStore()
    const res = await setLineup(
      {
        performanceId: '10',
        entries: [
          { nickname: 'cici', role: 'crni_kralj' },
          { nickname: 'BEPO', role: 'bili' },
        ],
      },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(res.written.map((w) => w.nickname)).toEqual(['Ćići', 'Bepo'])
    expect(res.unmatched).toEqual([])
    expect(replaced).toEqual([
      {
        performanceId: '10',
        entries: [
          { memberId: '1', role: 'crni_kralj' },
          { memberId: '2', role: 'bili' },
        ],
      },
    ])
  })

  it('reports an unmatched name instead of guessing, and still writes the rest', async () => {
    const { store, replaced } = fakeStore()
    const res = await setLineup(
      {
        performanceId: '10',
        entries: [
          { nickname: 'Ćići', role: 'crni' },
          { nickname: 'Mrkva', role: 'bili' },
        ],
      },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(res.unmatched).toEqual(['Mrkva'])
    expect(replaced[0]!.entries).toEqual([{ memberId: '1', role: 'crni' }])
  })

  it('refuses the whole call when nothing matched, rather than blanking the postava', async () => {
    const { store, replaced } = fakeStore()
    const res = await setLineup(
      { performanceId: '10', entries: [{ nickname: 'Mrkva', role: 'bili' }] },
      store,
    )
    expect(res.ok).toBe(false)
    expect(replaced).toEqual([])
  })

  it('refuses a confirmed postava and writes nothing', async () => {
    const { store, replaced } = fakeStore({
      performances: [performance({ lineupConfirmed: true })],
    })
    const res = await setLineup(
      { performanceId: '10', entries: [{ nickname: 'Ćići', role: 'crni' }] },
      store,
    )
    expect(res).toMatchObject({ ok: false })
    if (res.ok) throw new Error('unreachable')
    expect(res.error).toContain('Otključaj')
    expect(replaced).toEqual([])
  })

  it('reports the locked re-check losing the race the same way', async () => {
    const { store } = fakeStore({ confirmedRace: true })
    const res = await setLineup(
      { performanceId: '10', entries: [{ nickname: 'Ćići', role: 'crni' }] },
      store,
    )
    expect(res).toMatchObject({ ok: false })
  })

  it('refuses a role outside the vocabulary rather than dropping the row', async () => {
    const { store, replaced } = fakeStore()
    const res = await setLineup(
      {
        performanceId: '10',
        entries: [
          { nickname: 'Ćići', role: 'crni' },
          { nickname: 'Bepo', role: 'kapetan' },
        ],
      },
      store,
    )
    expect(res).toMatchObject({ ok: false })
    expect(replaced).toEqual([])
  })

  it('warns about a role the dancer does not have, and saves it anyway', async () => {
    const { store, replaced } = fakeStore()
    const res = await setLineup(
      { performanceId: '10', entries: [{ nickname: 'Bepo', role: 'bula' }] },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(res.warnings.join(' ')).toContain('Bepo')
    expect(replaced[0]!.entries).toEqual([{ memberId: '2', role: 'bula' }])
  })

  it('keeps the first of a duplicated nickname and says so', async () => {
    const { store, replaced } = fakeStore()
    const res = await setLineup(
      {
        performanceId: '10',
        entries: [
          { nickname: 'Ćići', role: 'crni_kralj' },
          { nickname: 'cici', role: 'crni' },
        ],
      },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(replaced[0]!.entries).toEqual([{ memberId: '1', role: 'crni_kralj' }])
    expect(res.warnings.join(' ')).toContain('dva puta')
  })

  it('refuses an empty list and an unknown performance', async () => {
    const { store } = fakeStore()
    expect(await setLineup({ performanceId: '10', entries: [] }, store)).toMatchObject({ ok: false })
    expect(
      await setLineup({ performanceId: '999', entries: [{ nickname: 'Ćići', role: 'crni' }] }, store),
    ).toMatchObject({ ok: false })
  })
})

describe('create_performances', () => {
  it('writes non-public rows at noon UTC, as one batch', async () => {
    const { store, createdBatches } = fakeStore()
    const res = await createPerformances(
      {
        rows: [
          { date: '2027-05-04', time: '10:30', kind: 'dmc', location: 'Le Ponant, luka', client: 'DMC' },
          { date: '2027-05-06', time: '11:00', kind: 'gulliver', location: 'Riva', note: 'mol' },
        ],
      },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(res.created).toEqual(['2027-05-04', '2027-05-06'])
    expect(createdBatches).toHaveLength(1)
    expect(createdBatches[0]![0]!.data).toMatchObject({
      date: '2027-05-04T12:00:00.000Z',
      time: '10:30',
      kind: 'dmc',
      isPublic: false,
      location: 'Le Ponant, luka',
      client: 'DMC',
      venue: null,
    })
    expect(createdBatches[0]![1]!.data.voditeljNote).toBe('mol')
  })

  it('refuses a redovna and points at the administration', async () => {
    const { store, createdBatches } = fakeStore()
    const res = await createPerformances(
      { rows: [{ date: '2027-07-01', time: '21:00', kind: 'redovna', location: 'Ljetno kino' }] },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(res.created).toEqual([])
    expect(res.rejected[0]!.error).toContain('administraciji')
    expect(createdBatches).toEqual([])
  })

  it('writes nothing when any row is bad, and names every one of them', async () => {
    const { store, createdBatches } = fakeStore()
    const res = await createPerformances(
      {
        rows: [
          { date: '2027-05-04', time: '10:30', kind: 'dmc', location: 'Luka' },
          { date: '4.5.2027.', time: '10:30', kind: 'dmc', location: 'Luka' },
          { date: '2027-05-05', time: '25:00', kind: 'dmc', location: 'Luka' },
          { date: '2027-05-06', time: '10:30', kind: 'koncert' },
          { date: '2026-02-31', time: '10:30', kind: 'dmc', location: 'Luka' },
        ],
      },
      store,
    )
    if (!res.ok) throw new Error(res.error)
    expect(createdBatches).toEqual([])
    expect(res.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4])
    // 31 February would have become 3 March without the calendar check.
    expect(res.rejected[3]!.error).toContain('ne postoji u kalendaru')
    // The last one is the collection's own invariant: no location, no booking.
    expect(res.rejected[2]!.error.toLowerCase()).toContain('location')
  })

  it('refuses an empty or missing list', async () => {
    const { store } = fakeStore()
    expect(await createPerformances({ rows: [] }, store)).toMatchObject({ ok: false })
    expect(await createPerformances({}, store)).toMatchObject({ ok: false })
  })
})
