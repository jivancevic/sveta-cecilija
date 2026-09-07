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
