import { describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/lib/access/permissions'
import type { PerformancePatch, PerformanceRow } from '@/lib/repo/shows'
import type { AppRequestMeta } from './request-guard'
import {
  MAX_THRESHOLD,
  handleCancelPerformance,
  handleCreatePerformance,
  handleEditPerformance,
  handlePausePerformance,
  handleThresholds,
  parseThresholds,
  type PerformanceFormDeps,
} from './performance-form'

// The voditelj's half of Izvedbe (#503): Dodaj, Uredi, Otkaži, Pragovi.
//
// Two rules run through every one of these and are what the tests are really
// about:
//
//   1. **A public row is not the voditelj's.** Its date, kind, place and status
//      belong to the blagajna, because moving or cancelling one mails hundreds
//      of buyers. Only the thresholds, which are a roster fact, reach it.
//   2. **Nothing is written until the row has been read.** An unknown id is a
//      refusal, never a create-by-accident.

const OK_REQUEST: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const CROSS_SITE: AppRequestMeta = { ...OK_REQUEST, secFetchSite: 'cross-site' }

const BOOKING: PerformanceRow = {
  id: '7',
  date: '2027-05-04',
  time: '10:30',
  kind: 'dmc',
  isPublic: false,
  cancelled: false,
  location: 'Luka',
  client: 'Le Ponant',
  venue: null,
  paused: false,
  thresholdCrni: 8,
  thresholdBili: 8,
}

const REDOVNA: PerformanceRow = {
  ...BOOKING,
  id: '9',
  kind: 'redovna',
  isPublic: true,
  location: null,
  client: null,
  venue: 'ljetno-kino',
}

const GOOD_BODY = {
  date: '2027-05-04',
  time: '10:30',
  kind: 'dmc',
  location: 'Luka',
  client: 'Le Ponant',
}

function deps(
  row: PerformanceRow | null = BOOKING,
  request: AppRequestMeta = OK_REQUEST,
  /** The caller's set. The default is the voditelj, whose half this file began as. */
  permissions: Permission[] = ['moreska'],
) {
  const created: { dateStr: string; data: Record<string, unknown> }[][] = []
  const updated: { id: string; patch: PerformancePatch }[] = []
  const d: PerformanceFormDeps = {
    request,
    permissions,
    loadPerformance: vi.fn(async () => row),
    createPerformances: async (rows) => {
      created.push([...rows])
      return { created: rows.map((r) => r.dateStr) }
    },
    updatePerformance: async (id, patch) => {
      updated.push({ id, patch })
    },
  }
  return { deps: d, created, updated }
}

describe('handleCreatePerformance', () => {
  it('writes one non-public performance and answers with its day', async () => {
    const { deps: d, created } = deps()
    const res = await handleCreatePerformance({ ...GOOD_BODY, note: 'mol u 9:30' }, d)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, date: '2027-05-04' })
    expect(created).toHaveLength(1)
    expect(created[0]).toHaveLength(1)
    expect(created[0]![0]!.data).toMatchObject({
      date: '2027-05-04T12:00:00.000Z',
      time: '10:30',
      kind: 'dmc',
      isPublic: false,
      location: 'Luka',
      client: 'Le Ponant',
      voditeljNote: 'mol u 9:30',
      status: 'active',
    })
  })

  it('refuses a redovna: a public show is born in the backoffice', async () => {
    const { deps: d, created } = deps()
    const res = await handleCreatePerformance({ ...GOOD_BODY, kind: 'redovna' }, d)

    expect(res.status).toBe(400)
    expect(created).toEqual([])
  })

  it.each([
    ['no date', { date: '' }],
    ['a day nobody has', { date: '2026-02-31' }],
    ['no time', { time: '' }],
    ['no place', { location: '  ' }],
  ])('refuses %s and writes nothing', async (_label, patch) => {
    const { deps: d, created } = deps()
    const res = await handleCreatePerformance({ ...GOOD_BODY, ...patch }, d)

    expect(res.status).toBe(400)
    expect(created).toEqual([])
  })

  it('refuses a cross-site POST before it reads the body', async () => {
    const { deps: d, created } = deps(BOOKING, CROSS_SITE)
    const res = await handleCreatePerformance(GOOD_BODY, d)

    expect(res.status).toBe(403)
    expect(created).toEqual([])
  })
})

describe('handleEditPerformance', () => {
  it('patches the schedule and the placement of a booking', async () => {
    const { deps: d, updated } = deps()
    const res = await handleEditPerformance(
      '7',
      { ...GOOD_BODY, date: '2027-05-06', time: '11:00', client: '' },
      d,
    )

    expect(res.status).toBe(200)
    expect(updated).toEqual([
      {
        id: '7',
        patch: {
          date: '2027-05-06T12:00:00.000Z',
          time: '11:00',
          kind: 'dmc',
          location: 'Luka',
          client: null,
        },
      },
    ])
  })

  it('refuses a PUBLIC performance: moving one mails every buyer', async () => {
    const { deps: d, updated } = deps(REDOVNA)
    const res = await handleEditPerformance('9', GOOD_BODY, d)

    expect(res.status).toBe(403)
    expect(updated).toEqual([])
  })

  it('refuses a CANCELLED performance with a 409', async () => {
    const { deps: d, updated } = deps({ ...BOOKING, cancelled: true })
    const res = await handleEditPerformance('7', { ...GOOD_BODY, date: '2027-05-06' }, d)

    // Moving a cancelled evening would push "izvedba je premještena" at a
    // roster that was told it is off. A cancelled row is a record, not a
    // draft: to move it, make a new one.
    expect(res.status).toBe(409)
    expect(updated).toEqual([])
  })

  it('refuses an id that is not a performance', async () => {
    const { deps: d, updated } = deps(null)
    const res = await handleEditPerformance('404', GOOD_BODY, d)

    expect(res.status).toBe(400)
    expect(updated).toEqual([])
  })

  it('refuses an id that is not there at all', async () => {
    const { deps: d, updated } = deps()
    const res = await handleEditPerformance('  ', GOOD_BODY, d)

    expect(res.status).toBe(400)
    expect(updated).toEqual([])
  })

  it('refuses a cross-site PATCH', async () => {
    const { deps: d, updated } = deps(BOOKING, CROSS_SITE)
    expect((await handleEditPerformance('7', GOOD_BODY, d)).status).toBe(403)
    expect(updated).toEqual([])
  })
})

describe('handleCancelPerformance', () => {
  it('flips the status of a booking and nothing else', async () => {
    const { deps: d, updated } = deps()
    const res = await handleCancelPerformance('7', d)

    expect(res.status).toBe(200)
    expect(updated).toEqual([{ id: '7', patch: { status: 'cancelled' } }])
  })

  it('refuses a PUBLIC performance: that cancellation refunds buyers', async () => {
    const { deps: d, updated } = deps(REDOVNA)
    const res = await handleCancelPerformance('9', d)

    expect(res.status).toBe(403)
    expect(updated).toEqual([])
  })

  it('is a no-op on a performance that is already cancelled', async () => {
    const { deps: d, updated } = deps({ ...BOOKING, cancelled: true })
    const res = await handleCancelPerformance('7', d)

    // Not an error: the voditelj wanted it cancelled and it is. A second write
    // would push "otkazano" at the roster a second time.
    expect(res.status).toBe(200)
    expect(updated).toEqual([])
  })

  it('refuses an unknown performance', async () => {
    const { deps: d, updated } = deps(null)
    expect((await handleCancelPerformance('404', d)).status).toBe(400)
    expect(updated).toEqual([])
  })
})

describe('parseThresholds', () => {
  it('accepts two whole numbers in range', () => {
    expect(parseThresholds({ crni: 6, bili: 10 })).toEqual({ ok: true, crni: 6, bili: 10 })
    expect(parseThresholds({ crni: '0', bili: String(MAX_THRESHOLD) })).toEqual({
      ok: true,
      crni: 0,
      bili: MAX_THRESHOLD,
    })
  })

  it.each([
    ['a negative number', { crni: -1, bili: 8 }],
    ['one over the cap', { crni: 8, bili: MAX_THRESHOLD + 1 }],
    ['a fraction', { crni: 7.5, bili: 8 }],
    ['a word', { crni: 'osam', bili: 8 }],
    ['a missing half', { crni: 8 }],
    ['nothing at all', {}],
  ])('refuses %s', (_label, body) => {
    expect(parseThresholds(body).ok).toBe(false)
  })
})

describe('handleThresholds', () => {
  it('saves both numbers on a booking', async () => {
    const { deps: d, updated } = deps()
    const res = await handleThresholds('7', { crni: 6, bili: 10 }, d)

    expect(res.status).toBe(200)
    expect(updated).toEqual([{ id: '7', patch: { thresholdCrni: 6, thresholdBili: 10 } }])
  })

  it('saves them on a PUBLIC performance too: a threshold is a roster fact', async () => {
    const { deps: d, updated } = deps(REDOVNA)
    const res = await handleThresholds('9', { crni: 9, bili: 9 }, d)

    expect(res.status).toBe(200)
    expect(updated).toEqual([{ id: '9', patch: { thresholdCrni: 9, thresholdBili: 9 } }])
  })

  it('refuses a number out of range and writes nothing', async () => {
    const { deps: d, updated } = deps()
    expect((await handleThresholds('7', { crni: -3, bili: 8 }, d)).status).toBe(400)
    expect(updated).toEqual([])
  })

  it('refuses an unknown performance', async () => {
    const { deps: d, updated } = deps(null)
    expect((await handleThresholds('404', { crni: 8, bili: 8 }, d)).status).toBe(400)
    expect(updated).toEqual([])
  })

  it('refuses a cross-site POST', async () => {
    const { deps: d, updated } = deps(BOOKING, CROSS_SITE)
    expect((await handleThresholds('7', { crni: 8, bili: 8 }, d)).status).toBe(403)
    expect(updated).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The blagajna's half (#502): a PUBLIC evening is theirs, and only theirs
// ---------------------------------------------------------------------------
//
// The rule these tests are really about is the mirror of the voditelj's: a
// public row sells tickets, so its house, its hour and its sale belong to the
// person who answers for the money. The handler asks the permission set
// because the local API runs `overrideAccess: true` and the collection's field
// locks therefore do not run for any of these writes (CLAUDE.md).

const PUBLIC_BODY = {
  date: '2027-07-19',
  time: '21:00',
  kind: 'redovna',
  venue: 'ljetno-kino',
  isPublic: true,
}

describe('Dodaj, when the body asks for a PUBLIC performance', () => {
  it('lets a `tickets` holder create one, venue and all', async () => {
    const { deps: d, created } = deps(BOOKING, OK_REQUEST, ['tickets'])
    const res = await handleCreatePerformance(PUBLIC_BODY, d)

    expect(res.status).toBe(200)
    expect(created[0]![0]!.data).toMatchObject({
      date: '2027-07-19T12:00:00.000Z',
      time: '21:00',
      kind: 'redovna',
      isPublic: true,
      venue: 'ljetno-kino',
      onlineSalesPaused: false,
    })
  })

  it('refuses a voditelj, whose rows never sell a ticket', async () => {
    const { deps: d, created } = deps(BOOKING, OK_REQUEST, ['moreska'])
    const res = await handleCreatePerformance(PUBLIC_BODY, d)

    expect(res.status).toBe(403)
    expect(created).toEqual([])
  })

  it('refuses a `tickets` holder a NON-public row: that is the voditelj’s', async () => {
    const { deps: d, created } = deps(BOOKING, OK_REQUEST, ['tickets'])
    const res = await handleCreatePerformance(GOOD_BODY, d)

    expect(res.status).toBe(403)
    expect(created).toEqual([])
  })

  it('lets somebody who holds both do either', async () => {
    const both: Permission[] = ['tickets', 'moreska']
    expect((await handleCreatePerformance(PUBLIC_BODY, deps(BOOKING, OK_REQUEST, both).deps)).status).toBe(200)
    expect((await handleCreatePerformance(GOOD_BODY, deps(BOOKING, OK_REQUEST, both).deps)).status).toBe(200)
  })
})

describe('Uredi, on a PUBLIC performance', () => {
  const EDIT = { time: '21:30', kind: 'redovna', venue: 'zimsko-kino' }

  it('lets a `tickets` holder change the hour, the house and the kind', async () => {
    const { deps: d, updated } = deps(REDOVNA, OK_REQUEST, ['tickets'])
    const res = await handleEditPerformance('9', EDIT, d)

    expect(res.status).toBe(200)
    expect(updated).toEqual([
      { id: '9', patch: { time: '21:30', kind: 'redovna', venue: 'zimsko-kino' } },
    ])
  })

  it('never writes the date: moving a public evening is its own action', async () => {
    const { deps: d, updated } = deps(REDOVNA, OK_REQUEST, ['tickets'])
    await handleEditPerformance('9', { ...EDIT, date: '2099-01-01' }, d)

    expect(Object.keys(updated[0]!.patch)).not.toContain('date')
  })

  it('refuses a voditelj, even one who also holds `moreskant`', async () => {
    const { deps: d, updated } = deps(REDOVNA, OK_REQUEST, ['moreska', 'moreskant'])
    const res = await handleEditPerformance('9', EDIT, d)

    expect(res.status).toBe(403)
    expect(updated).toEqual([])
  })

  it('refuses a `tickets` holder a BOOKING: that stays the voditelj’s row', async () => {
    const { deps: d, updated } = deps(BOOKING, OK_REQUEST, ['tickets'])
    const res = await handleEditPerformance('7', GOOD_BODY, d)

    expect(res.status).toBe(403)
    expect(updated).toEqual([])
  })

  it('refuses a cancelled public evening, as it refuses a cancelled booking', async () => {
    const { deps: d, updated } = deps({ ...REDOVNA, cancelled: true }, OK_REQUEST, ['tickets'])
    const res = await handleEditPerformance('9', EDIT, d)

    expect(res.status).toBe(409)
    expect(updated).toEqual([])
  })

  it('refuses a body with no venue and writes nothing', async () => {
    const { deps: d, updated } = deps(REDOVNA, OK_REQUEST, ['tickets'])
    const res = await handleEditPerformance('9', { time: '21:30', kind: 'redovna' }, d)

    expect(res.status).toBe(400)
    expect(updated).toEqual([])
  })
})

describe('handlePausePerformance', () => {
  it('turns online sales off, and on again', async () => {
    const off = deps(REDOVNA, OK_REQUEST, ['tickets'])
    expect((await handlePausePerformance('9', { paused: true }, off.deps)).status).toBe(200)
    expect(off.updated).toEqual([{ id: '9', patch: { onlineSalesPaused: true } }])

    const on = deps({ ...REDOVNA, paused: true }, OK_REQUEST, ['tickets'])
    expect((await handlePausePerformance('9', { paused: false }, on.deps)).status).toBe(200)
    expect(on.updated).toEqual([{ id: '9', patch: { onlineSalesPaused: false } }])
  })

  it('refuses a booking: a row that sells nothing has no sale to pause', async () => {
    const { deps: d, updated } = deps(BOOKING, OK_REQUEST, ['tickets'])
    const res = await handlePausePerformance('7', { paused: true }, d)

    expect(res.status).toBe(400)
    expect(updated).toEqual([])
  })

  it('refuses a body that says neither true nor false', async () => {
    const { deps: d, updated } = deps(REDOVNA, OK_REQUEST, ['tickets'])
    expect((await handlePausePerformance('9', { paused: 'da' }, d)).status).toBe(400)
    expect(updated).toEqual([])
  })

  it('refuses a cross-site POST', async () => {
    const { deps: d, updated } = deps(REDOVNA, CROSS_SITE, ['tickets'])
    expect((await handlePausePerformance('9', { paused: true }, d)).status).toBe(403)
    expect(updated).toEqual([])
  })
})
