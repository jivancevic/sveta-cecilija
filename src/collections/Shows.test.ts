import { describe, expect, it } from 'vitest'
import { Shows } from './Shows'
import { PERFORMANCE_KINDS } from '@/lib/show-performance'

type AnyField = { name?: string; type?: string; required?: boolean; defaultValue?: unknown; options?: unknown }

const fields = Shows.fields as AnyField[]
const field = (name: string) => fields.find((f) => f.name === name)

// The beforeValidate hook is the collection's only save-validation seam; the
// rules it delegates to are unit-tested in src/lib/show-performance.test.ts.
type Hook = (args: {
  data?: Record<string, unknown>
  originalDoc?: Record<string, unknown>
  operation?: string
  req?: { user?: unknown }
}) => Record<string, unknown>

const beforeValidate = (Shows.hooks?.beforeValidate as unknown as Hook[])[0]

describe('Shows collection fields', () => {
  it('offers exactly the five performance kinds, defaulting to redovna', () => {
    const kind = field('kind')!
    expect((kind.options as { value: string }[]).map((o) => o.value)).toEqual([
      ...PERFORMANCE_KINDS,
    ])
    expect(kind.defaultValue).toBe('redovna')
    expect(kind.required).toBe(true)
  })

  it('defaults isPublic to true and stores it NOT NULL', () => {
    const isPublic = field('isPublic')!
    expect(isPublic.type).toBe('checkbox')
    expect(isPublic.defaultValue).toBe(true)
    expect(isPublic.required).toBe(true)
  })

  it('leaves venue optional (a non-public performance has none) with no default', () => {
    const venue = field('venue')!
    expect(venue.required).toBeUndefined()
    expect(venue.defaultValue).toBeUndefined()
  })

  it('defaults both army thresholds to 8', () => {
    expect(field('thresholdCrni')!.defaultValue).toBe(8)
    expect(field('thresholdBili')!.defaultValue).toBe(8)
  })

  it('carries the roster note and the non-public place/client fields', () => {
    expect(field('voditeljNote')!.type).toBe('textarea')
    expect(field('location')!.type).toBe('text')
    expect(field('client')!.type).toBe('text')
  })

  it('shows kind, isPublic, location and client in the default list columns', () => {
    expect(Shows.admin?.defaultColumns).toEqual(
      expect.arrayContaining(['kind', 'isPublic', 'location', 'client']),
    )
  })
})

describe('Shows beforeValidate', () => {
  it('rejects a redovna that is not public', () => {
    expect(() =>
      beforeValidate({
        data: { kind: 'redovna', isPublic: false, location: 'Zimsko kino' },
      }),
    ).toThrow(/redovna/i)
  })

  it('rejects a public performance with no venue', () => {
    expect(() => beforeValidate({ data: { kind: 'redovna', isPublic: true } })).toThrow(/venue/i)
  })

  it('rejects a non-public performance with no location', () => {
    expect(() => beforeValidate({ data: { kind: 'dmc', isPublic: false } })).toThrow(/location/i)
  })

  it('forces venue NULL, counters 0 and sales-paused false on a non-public save', () => {
    const out = beforeValidate({
      data: {
        kind: 'gulliver',
        isPublic: false,
        location: 'Ljetno kino',
        venue: 'ljetno-kino',
        inPersonSold: 30,
        legacyReserved: 2,
        onlineSalesPaused: true,
      },
    })
    expect(out.venue).toBeNull()
    expect(out.inPersonSold).toBe(0)
    expect(out.legacyReserved).toBe(0)
    expect(out.onlineSalesPaused).toBe(false)
  })

  it('validates the effective document on a partial update, not just the patch', () => {
    // Reschedule-style patch: only `date` changes; the stored row is a valid
    // public redovna, so this must pass.
    expect(() =>
      beforeValidate({
        data: { date: '2026-08-01T12:00:00.000Z' },
        originalDoc: { kind: 'redovna', isPublic: true, venue: 'ljetno-kino' },
      }),
    ).not.toThrow()
  })

  it('keeps a partial update partial (no unrelated keys written back)', () => {
    const out = beforeValidate({
      data: { time: '21:30' },
      originalDoc: { kind: 'redovna', isPublic: true, venue: 'ljetno-kino' },
    })
    expect(out).toEqual({ time: '21:30' })
  })

  it('forces the sales fields when a stored public show is flipped to non-public', () => {
    const out = beforeValidate({
      data: { isPublic: false, kind: 'ostalo', location: 'Sv. Justina' },
      originalDoc: { kind: 'redovna', isPublic: true, venue: 'ljetno-kino', inPersonSold: 12 },
    })
    expect(out.venue).toBeNull()
    expect(out.inPersonSold).toBe(0)
  })
})

// The phase-2 access wiring (#408). The rules themselves are unit-tested in
// src/lib/access/shows-access.test.ts; here we check that the collection hangs
// them on the right fields, with the document-aware ones actually reading the
// row.
describe('Shows field-level locks', () => {
  const voditelj = { permissions: ['moreska'] }
  const ticketAdmin = { permissions: ['tickets'] }
  const publicRow = { isPublic: true }
  const nonPublicRow = { isPublic: false }

  const fieldAccess = (name: string, op: 'read' | 'create' | 'update') => {
    const f = field(name) as { access?: Record<string, unknown> } | undefined
    return f?.access?.[op] as
      | ((args: { req: { user: unknown }; doc?: Record<string, unknown> }) => boolean)
      | undefined
  }

  it.each(['date', 'time', 'kind', 'venue', 'status', 'inPersonSold', 'legacyReserved', 'onlineSalesPaused'])(
    'locks %s to the backoffice on a public row and opens it to the voditelj on a private one',
    (name) => {
      const update = fieldAccess(name, 'update')!
      expect(update({ req: { user: ticketAdmin }, doc: publicRow })).toBe(true)
      expect(update({ req: { user: voditelj }, doc: publicRow })).toBe(false)
      expect(update({ req: { user: voditelj }, doc: nonPublicRow })).toBe(true)
    },
  )

  it('lets only the backoffice set the public flag, on create and on update', () => {
    for (const op of ['create', 'update'] as const) {
      const access = fieldAccess('isPublic', op)!
      expect(access({ req: { user: ticketAdmin } })).toBe(true)
      expect(access({ req: { user: voditelj } })).toBe(false)
    }
  })

  it.each(['thresholdCrni', 'thresholdBili', 'voditeljNote'])(
    'hides %s from the backoffice and gives it to the voditelj',
    (name) => {
      for (const op of ['read', 'update'] as const) {
        const access = fieldAccess(name, op)!
        expect(access({ req: { user: voditelj } })).toBe(true)
        expect(access({ req: { user: ticketAdmin } })).toBe(false)
      }
    },
  )

  // The schedule lock is an UPDATE lock only. A voditelj entering a new private
  // booking has to fill the date, time, kind, location and client on the create
  // form; only `isPublic` is pinned on create (and the beforeValidate hook
  // forces it anyway).
  it.each(['date', 'time', 'kind', 'venue', 'status', 'location', 'client'])(
    'leaves %s open on create, so a voditelj can fill it on a new booking',
    (name) => {
      expect(fieldAccess(name, 'create')).toBeUndefined()
    },
  )

  it.each(['location', 'client'])('lets both the backoffice and the voditelj write %s', (name) => {
    const update = fieldAccess(name, 'update')!
    expect(update({ req: { user: ticketAdmin }, doc: publicRow })).toBe(true)
    expect(update({ req: { user: voditelj }, doc: publicRow })).toBe(true)
  })

  it('leaves location and client readable by every reader', () => {
    expect(fieldAccess('location', 'read')).toBeUndefined()
    expect(fieldAccess('client', 'read')).toBeUndefined()
  })
})

describe('Shows beforeValidate: the voditelj can never author a public row', () => {
  const voditelj = { permissions: ['moreska'] }

  it('forces a voditelj creation non-public, even when the default said otherwise', () => {
    // The isPublic field lock has already dropped the submitted value and
    // Payload has fallen back to the `true` default by the time this runs.
    const out = beforeValidate({
      data: { isPublic: true, kind: 'redovna', date: '2026-09-20T12:00:00.000Z', time: '10:00', location: 'Zimsko kino' },
      operation: 'create',
      req: { user: voditelj },
    })
    expect(out.isPublic).toBe(false)
    expect(out.kind).toBe('ostalo')
    expect(out.venue).toBeNull()
  })

  it('keeps the kind a voditelj chose', () => {
    const out = beforeValidate({
      data: { isPublic: true, kind: 'gulliver', location: 'Ljetno kino' },
      operation: 'create',
      req: { user: voditelj },
    })
    expect(out.isPublic).toBe(false)
    expect(out.kind).toBe('gulliver')
  })

  it('never flips a public show a voditelj is only adding a note to', () => {
    const out = beforeValidate({
      data: { voditeljNote: 'meet at the harbour gate at 9:30' },
      originalDoc: { kind: 'redovna', isPublic: true, venue: 'ljetno-kino' },
      operation: 'update',
      req: { user: voditelj },
    })
    expect(out.isPublic).toBeUndefined()
    expect(out).toEqual({ voditeljNote: 'meet at the harbour gate at 9:30' })
  })

  it('leaves a backoffice creation alone', () => {
    const out = beforeValidate({
      data: { isPublic: true, kind: 'redovna', venue: 'ljetno-kino' },
      operation: 'create',
      req: { user: { permissions: ['tickets'] } },
    })
    expect(out.isPublic).toBe(true)
    expect(out.kind).toBe('redovna')
  })

  it('leaves the sessionless server paths alone (webhook, bulk create, seeds)', () => {
    const out = beforeValidate({
      data: { isPublic: true, kind: 'redovna', venue: 'ljetno-kino' },
      operation: 'create',
      req: {},
    })
    expect(out.isPublic).toBe(true)
  })
})
