import { describe, expect, it } from 'vitest'
import { WITHDRAWAL_GRACE_MS, resolveUndo, stampWithdrawal } from './withdrawal-stamp'

const T0 = Date.parse('2026-07-14T18:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

function stamp(overrides: Partial<Parameters<typeof stampWithdrawal>[0]> = {}) {
  return stampWithdrawal({
    previousStatus: null,
    nextStatus: 'coming',
    confirmedAt: null,
    withdrewAt: null,
    withdrewOwn: null,
    ownAnswer: true,
    nowMs: T0,
    ...overrides,
  })
}

describe('stampWithdrawal → coming', () => {
  it('starts the promise on a first "dolazim"', () => {
    expect(stamp()).toEqual({ confirmedAt: iso(T0), withdrewAt: null, withdrewOwn: null })
  })

  it('does NOT restart the promise while the answer stays "dolazim"', () => {
    // An army move re-posts a `coming`. If that moved `confirmedAt`, a dancer
    // could keep a withdrawal off the list forever by tapping Dolazim first.
    const earlier = iso(T0 - 60 * 60 * 1000)
    expect(stamp({ previousStatus: 'coming', confirmedAt: earlier }).confirmedAt).toBe(earlier)
  })

  it('forgets an earlier withdrawal when the dancer comes back', () => {
    const out = stamp({
      previousStatus: 'not_coming',
      confirmedAt: iso(T0 - 5 * 60 * 60 * 1000),
      withdrewAt: iso(T0 - 60 * 60 * 1000),
      withdrewOwn: true,
    })
    expect(out).toEqual({ confirmedAt: iso(T0), withdrewAt: null, withdrewOwn: null })
  })
})

describe('stampWithdrawal → not_coming', () => {
  it('records an odustajanje once the promise has stood ten minutes', () => {
    const out = stamp({
      previousStatus: 'coming',
      nextStatus: 'not_coming',
      confirmedAt: iso(T0 - WITHDRAWAL_GRACE_MS),
    })
    expect(out).toEqual({
      confirmedAt: iso(T0 - WITHDRAWAL_GRACE_MS),
      withdrewAt: iso(T0),
      withdrewOwn: true,
    })
  })

  it('treats a faster reversal as a mis-tap and records nothing', () => {
    const out = stamp({
      previousStatus: 'coming',
      nextStatus: 'not_coming',
      confirmedAt: iso(T0 - (WITHDRAWAL_GRACE_MS - 1)),
    })
    expect(out.withdrewAt).toBeNull()
    expect(out.withdrewOwn).toBeNull()
  })

  it('marks a voditelj writing it down, so the list can say the dancer phoned', () => {
    const out = stamp({
      previousStatus: 'coming',
      nextStatus: 'not_coming',
      confirmedAt: iso(T0 - WITHDRAWAL_GRACE_MS),
      ownAnswer: false,
    })
    expect(out.withdrewOwn).toBe(false)
  })

  it('records nothing for somebody who never said they were coming', () => {
    const out = stamp({ previousStatus: null, nextStatus: 'not_coming' })
    expect(out).toEqual({ confirmedAt: null, withdrewAt: null, withdrewOwn: null })
  })

  it('leaves an existing odustajanje alone when "ne dolazim" is re-answered', () => {
    // The dangerous branch: `previousStatus` is now `not_coming`, which reads
    // as "never promised" — recomputing here would erase the very row Stanje
    // is showing.
    const out = stamp({
      previousStatus: 'not_coming',
      nextStatus: 'not_coming',
      confirmedAt: iso(T0 - 3 * 60 * 60 * 1000),
      withdrewAt: iso(T0 - 2 * 60 * 60 * 1000),
      withdrewOwn: false,
    })
    expect(out).toEqual({
      confirmedAt: iso(T0 - 3 * 60 * 60 * 1000),
      withdrewAt: iso(T0 - 2 * 60 * 60 * 1000),
      withdrewOwn: false,
    })
  })

  it('records nothing for a row answered before the migration', () => {
    // `coming` with no `confirmedAt` is a pre-#612 row. Guessing the promise
    // was old enough would put somebody on the list with an invented time.
    const out = stamp({ previousStatus: 'coming', nextStatus: 'not_coming', confirmedAt: null })
    expect(out.withdrewAt).toBeNull()
  })
})

describe('resolveUndo: un-tapping your own circle (#624)', () => {
  const undo = (overrides: Partial<Parameters<typeof resolveUndo>[0]> = {}) =>
    resolveUndo({
      previousStatus: 'coming',
      ownAnswer: true,
      nowMs: T0,
      stamps: { confirmedAt: iso(T0), withdrewAt: null, withdrewOwn: null },
      ...overrides,
    })

  it('deletes the row when there was never an answer', () => {
    expect(undo({ previousStatus: null })).toBe('delete')
  })

  it('deletes the row when the answer was "ne dolazim"', () => {
    // Nothing to withdraw from: they were never in the postava, so the voditelj
    // lost nothing and there is no odustajanje to record (Q13).
    expect(
      undo({
        previousStatus: 'not_coming',
        stamps: { confirmedAt: null, withdrewAt: null, withdrewOwn: null },
      }),
    ).toBe('delete')
  })

  it('keeps a "ne dolazim" that IS an odustajanje', () => {
    // The hole from the other side (#624 review): this row got to `not_coming`
    // by withdrawing, and deleting it would take the voditelj's Odustali entry
    // with it one tap after it landed there. The way back out is Dolazim, which
    // clears the trace on purpose.
    expect(
      undo({
        previousStatus: 'not_coming',
        stamps: {
          confirmedAt: iso(T0 - 3600_000),
          withdrewAt: iso(T0 - 60_000),
          withdrewOwn: true,
        },
      }),
    ).toBe('keep')
  })

  it('deletes the row when the "dolazim" is younger than the grace window', () => {
    // A mis-tap fixed three seconds later has withdrawn nothing.
    expect(
      undo({ stamps: { confirmedAt: iso(T0 - 1000), withdrewAt: null, withdrewOwn: null } }),
    ).toBe('delete')
  })

  it('withdraws instead of deleting once the promise has STOOD', () => {
    // The whole point of the request existing (Q12): a `dolazim` somebody has
    // been counting on is taken back, not un-said. A delete here would erase
    // the one thing the voditelj's Odustali list is built out of. What the
    // stamps then say is `stampWithdrawal`'s, asserted above and again on the
    // route, which is where the write actually happens.
    expect(
      undo({
        stamps: {
          confirmedAt: iso(T0 - WITHDRAWAL_GRACE_MS),
          withdrewAt: null,
          withdrewOwn: null,
        },
      }),
    ).toBe('withdraw')
  })
})
