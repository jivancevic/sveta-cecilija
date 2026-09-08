import { describe, expect, it } from 'vitest'
import {
  buildChangeMessage,
  decidePerformanceNotification,
  diffPerformance,
  toChangeSnapshot,
  type ChangeSnapshot,
} from './performance-change'

// #436 — the diff and the two messages a saved performance produces.
//
// The tests read the SENTENCE a device would show rather than the message
// object, because the sentence is the acceptance criterion ("the text says what
// changed") and the object is an implementation of it.

const AHEAD = Date.UTC(2026, 7, 1, 6, 0) // 1 Aug 2026, well before the 5th

function snapshot(overrides: Partial<ChangeSnapshot> = {}): ChangeSnapshot {
  return {
    id: '7',
    date: '2026-08-05',
    time: '21:00',
    kind: 'redovna',
    isPublic: true,
    venue: 'ljetno-kino',
    location: null,
    cancelled: false,
    voditeljNote: null,
    ...overrides,
  }
}

function text(previous: ChangeSnapshot, next: ChangeSnapshot): string {
  const message = buildChangeMessage(next, diffPerformance(previous, next), AHEAD)
  return `${message.title} ${message.body}`
}

describe('diffPerformance', () => {
  it('sees nothing in a save that touched only ticket counters', () => {
    expect(diffPerformance(snapshot(), snapshot())).toEqual([])
  })

  it('names each watched field on its own', () => {
    const base = snapshot()
    expect(diffPerformance(base, snapshot({ date: '2026-08-06' }))).toEqual(['date'])
    expect(diffPerformance(base, snapshot({ time: '20:00' }))).toEqual(['time'])
    expect(diffPerformance(base, snapshot({ venue: 'zimsko-kino' }))).toEqual(['place'])
    expect(diffPerformance(base, snapshot({ cancelled: true }))).toEqual(['cancelled'])
    expect(diffPerformance(base, snapshot({ voditeljNote: 'na molu' }))).toEqual(['note'])
  })

  it('reads the place off the venue or the location, whichever the row has', () => {
    const priv = snapshot({ isPublic: false, venue: null, location: 'Sv. Justina' })
    expect(diffPerformance(priv, snapshot({ ...priv, location: 'Spomenik sv. Todora' }))).toEqual([
      'place',
    ])
    expect(diffPerformance(priv, { ...priv })).toEqual([])
  })

  it('treats an empty note and no note as the same thing', () => {
    expect(diffPerformance(snapshot({ voditeljNote: null }), snapshot({ voditeljNote: '' }))).toEqual(
      [],
    )
  })

  it('lists several changes in a fixed order', () => {
    expect(
      diffPerformance(
        snapshot(),
        snapshot({ voditeljNote: 'na molu', time: '20:00', venue: 'zimsko-kino' }),
      ),
    ).toEqual(['time', 'place', 'note'])
  })
})

describe('the change sentence', () => {
  it('names what changed and states the new date and time', () => {
    expect(text(snapshot(), snapshot({ time: '20:00' }))).toBe(
      'Promjena izvedbe Izvedba srijeda, 5. kolovoza u 20:00. Promijenjeno: vrijeme.',
    )
  })

  it('has its own wording for a cancellation', () => {
    expect(text(snapshot(), snapshot({ cancelled: true }))).toBe(
      'Izvedba je otkazana Izvedba srijeda, 5. kolovoza u 21:00 je otkazana.',
    )
  })

  it('says so when a cancellation is undone', () => {
    expect(text(snapshot({ cancelled: true }), snapshot())).toContain('izvedba više nije otkazana')
  })

  it('expires with the performance it is about', () => {
    const message = buildChangeMessage(snapshot(), ['time'], AHEAD)
    // 1 Aug 06:00 UTC → 5 Aug 21:00 Zagreb (19:00 UTC) is a little over 4 days.
    expect(message.ttlSeconds).toBeGreaterThan(4 * 24 * 3600)
    expect(message.ttlSeconds).toBeLessThan(5 * 24 * 3600)
  })
})

describe('decidePerformanceNotification', () => {
  it('sends "nova izvedba" for a create', () => {
    const decision = decidePerformanceNotification({
      previous: null,
      next: snapshot(),
      nowMs: AHEAD,
    })
    expect(decision.kind).toBe('created')
    if (decision.kind !== 'created') return
    expect(`${decision.message.title} ${decision.message.body}`).toBe(
      'Nova izvedba Redovna, srijeda, 5. kolovoza u 21:00, Ljetno kino. Javi dolaziš li.',
    )
  })

  it('sends nothing for a save that changed nothing watched', () => {
    expect(
      decidePerformanceNotification({ previous: snapshot(), next: snapshot(), nowMs: AHEAD })
        .kind,
    ).toBe('none')
  })

  it('sends nothing about a performance that has already started', () => {
    const past = Date.UTC(2026, 7, 6, 6, 0)
    expect(
      decidePerformanceNotification({
        previous: snapshot(),
        next: snapshot({ time: '20:00' }),
        nowMs: past,
      }).kind,
    ).toBe('none')
    expect(
      decidePerformanceNotification({ previous: null, next: snapshot(), nowMs: past }).kind,
    ).toBe('none')
  })

  it('reports a moved start even when nobody is notified', () => {
    const past = Date.UTC(2026, 7, 6, 6, 0)
    const decision = decidePerformanceNotification({
      previous: snapshot({ date: '2026-08-04' }),
      next: snapshot(),
      nowMs: past,
    })
    expect(decision.kind).toBe('none')
    expect(decision.startMoved).toBe(true)
  })
})

describe('toChangeSnapshot', () => {
  it('reads a Payload doc, midnight-UTC date and all', () => {
    expect(
      toChangeSnapshot({
        id: 7,
        date: '2026-08-05T00:00:00.000Z',
        time: '21:00',
        kind: 'redovna',
        isPublic: true,
        venue: 'ljetno-kino',
        status: 'active',
        voditeljNote: '  ',
      }),
    ).toEqual(snapshot())
  })

  it('keeps a private booking to its location', () => {
    const snap = toChangeSnapshot({
      id: 9,
      date: '2026-09-01',
      time: '10:30',
      kind: 'dmc',
      isPublic: false,
      venue: 'ljetno-kino',
      location: 'Luka',
      status: 'cancelled',
    })
    expect(snap.venue).toBeNull()
    expect(snap.location).toBe('Luka')
    expect(snap.cancelled).toBe(true)
  })
})
