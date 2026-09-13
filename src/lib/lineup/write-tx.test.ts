import { describe, expect, it } from 'vitest'
import {
  decideConfirmation,
  replaceLineupInTransaction,
  setLineupConfirmationInTransaction,
  type LineupTxStore,
  type LockedLineupState,
} from './write-tx'
import type { LineupEntry } from './rules'
import type { TitleCounts } from './titles'

// #442 review — the row lock, driven through a fake executor.
//
// The point of a fake here is that it can do what a real database cannot be
// asked to do on cue: flip `lineupConfirmed` at the exact instant BETWEEN the
// handler's pre-check and the locked read. That is the race the lock exists
// for, and it is the only way to test it deterministically.
//
// The fake also records every statement in order, so "lock first, write after,
// rollback on refusal" is asserted as a sequence rather than as three
// independent facts.

interface Recorded {
  log: string[]
  entries: LineupEntry[]
  confirmation: { confirmed: boolean; confirmedAt: string | null }
}

function fakeStore(
  initial: LockedLineupState | null,
  opts: { onLock?: (state: LockedLineupState) => LockedLineupState; failInsert?: boolean } = {},
): { store: LineupTxStore<string>; rec: Recorded } {
  const rec: Recorded = {
    log: [],
    entries: [],
    confirmation: {
      confirmed: initial?.confirmed ?? false,
      confirmedAt: initial?.confirmedAt ?? null,
    },
  }
  let state = initial

  const store: LineupTxStore<string> = {
    begin: async () => {
      rec.log.push('begin')
      return 'tx-1'
    },
    commit: async (tx) => {
      rec.log.push(`commit:${tx}`)
    },
    rollback: async (tx) => {
      rec.log.push(`rollback:${tx}`)
    },
    lockPerformance: async (_id, tx) => {
      rec.log.push(`lock:${tx}`)
      if (!state) return null
      state = opts.onLock ? opts.onLock(state) : state
      return { ...state, entryCount: rec.entries.length || state.entryCount }
    },
    deleteEntries: async (_id, tx) => {
      rec.log.push(`delete:${tx}`)
      rec.entries = []
    },
    insertEntry: async (_id, entry, tx) => {
      rec.log.push(`insert:${tx}:${entry.memberId}`)
      if (opts.failInsert) throw new Error('boom')
      rec.entries.push(entry)
    },
    setConfirmation: async (_id, confirmed, confirmedAt, tx) => {
      rec.log.push(`confirm:${tx}:${confirmed}`)
      rec.confirmation = { confirmed, confirmedAt }
    },
  }
  return { store, rec }
}

/**
 * The four titles, all given once: the state a confirm is allowed from (#566).
 * Everything that is NOT about the title rule uses it, so those tests keep
 * asserting what they were written to assert.
 */
const ALL: TitleCounts = { crni_kralj: 1, otmanovic: 1, bili_kralj: 1, bula: 1 }
const NONE: TitleCounts = { crni_kralj: 0, otmanovic: 0, bili_kralj: 0, bula: 0 }

const draft: LockedLineupState = {
  confirmed: false,
  confirmedAt: null,
  entryCount: 0,
  titles: NONE,
}

describe('replaceLineupInTransaction', () => {
  it('locks first, then writes, then commits', async () => {
    const { store, rec } = fakeStore(draft)
    const outcome = await replaceLineupInTransaction(
      '10',
      [
        { memberId: '1', role: 'crni_kralj' },
        { memberId: '2', role: 'bili' },
      ],
      store,
    )
    expect(outcome).toEqual({ written: true })
    expect(rec.log).toEqual([
      'begin',
      'lock:tx-1',
      'delete:tx-1',
      'insert:tx-1:1',
      'insert:tx-1:2',
      'commit:tx-1',
    ])
    expect(rec.entries.map((e) => e.memberId)).toEqual(['1', '2'])
  })

  // THE RACE. The handler's pre-check saw a draft; a Potvrdi committed before
  // the lock was taken. The locked read is the one that decides.
  it('refuses and writes NOTHING when a Potvrdi lands between the pre-check and the lock', async () => {
    const { store, rec } = fakeStore(draft, {
      onLock: (state) => ({ ...state, confirmed: true, confirmedAt: '2026-08-05T19:00:00.000Z' }),
    })
    const outcome = await replaceLineupInTransaction(
      '10',
      [{ memberId: '1', role: 'crni' }],
      store,
    )
    expect(outcome).toEqual({ written: false, reason: 'confirmed' })
    expect(rec.log).toEqual(['begin', 'lock:tx-1', 'rollback:tx-1'])
    expect(rec.log).not.toContain('delete:tx-1')
    expect(rec.entries).toEqual([])
  })

  it('rolls back and reports missing when the performance is gone', async () => {
    const { store, rec } = fakeStore(null)
    const outcome = await replaceLineupInTransaction('10', [], store)
    expect(outcome).toEqual({ written: false, reason: 'missing' })
    expect(rec.log).toEqual(['begin', 'lock:tx-1', 'rollback:tx-1'])
  })

  // The other half of "transactional": a delete that succeeded with inserts
  // that did not must not leave a postava empty.
  it('rolls back and rethrows when an insert fails', async () => {
    const { store, rec } = fakeStore(draft, { failInsert: true })
    await expect(
      replaceLineupInTransaction('10', [{ memberId: '1', role: 'crni' }], store),
    ).rejects.toThrow('boom')
    expect(rec.log).toEqual(['begin', 'lock:tx-1', 'delete:tx-1', 'insert:tx-1:1', 'rollback:tx-1'])
  })
})

describe('decideConfirmation', () => {
  const nowIso = '2026-08-06T08:00:00.000Z'

  it('stamps the time when an unconfirmed postava with people in it is confirmed', () => {
    expect(
      decideConfirmation({
        confirmed: true,
        state: { confirmed: false, confirmedAt: null, entryCount: 3, titles: ALL },
        nowIso,
      }),
    ).toEqual({ ok: true, confirmed: true, confirmedAt: nowIso })
  })

  // #442 review: a second tap on a pressed button is not a second decision.
  it('leaves an existing stamp alone when re-confirming', () => {
    expect(
      decideConfirmation({
        confirmed: true,
        state: {
          confirmed: true,
          confirmedAt: '2026-08-05T19:00:00.000Z',
          entryCount: 3,
          titles: ALL,
        },
        nowIso,
      }),
    ).toEqual({ ok: true, confirmed: true, confirmedAt: '2026-08-05T19:00:00.000Z' })
  })

  it('stamps a confirmed row that somehow has no stamp, rather than leaving null', () => {
    expect(
      decideConfirmation({
        confirmed: true,
        state: { confirmed: true, confirmedAt: null, entryCount: 1, titles: ALL },
        nowIso,
      }),
    ).toEqual({ ok: true, confirmed: true, confirmedAt: nowIso })
  })

  it('refuses to confirm an empty postava', () => {
    expect(
      decideConfirmation({
        confirmed: true,
        state: { confirmed: false, confirmedAt: null, entryCount: 0, titles: ALL },
        nowIso,
      }),
    ).toEqual({ ok: false, reason: 'empty' })
  })

  // #566 — a confirmed postava carries all four titles, once each. The rule
  // lives under the row lock with the empty-postava one, and for the same
  // reason: both are statements about the moment of the write.
  it('refuses to confirm a postava with no bili kralj, and says which title', () => {
    const out = decideConfirmation({
      confirmed: true,
      state: {
        confirmed: false,
        confirmedAt: null,
        entryCount: 12,
        titles: { crni_kralj: 1, otmanovic: 1, bili_kralj: 0, bula: 1 },
      },
      nowIso,
    })
    expect(out).toEqual({ ok: false, reason: 'titles', message: 'Postava nema bilog kralja.' })
  })

  it('refuses to confirm a postava where two dancers wear one title', () => {
    const out = decideConfirmation({
      confirmed: true,
      state: {
        confirmed: false,
        confirmedAt: null,
        entryCount: 12,
        titles: { crni_kralj: 1, otmanovic: 2, bili_kralj: 1, bula: 1 },
      },
      nowIso,
    })
    expect(out).toEqual({
      ok: false,
      reason: 'titles',
      message: 'Dva plesača nose titulu Otmanović.',
    })
  })

  it('names every problem at once rather than one tap at a time', () => {
    const out = decideConfirmation({
      confirmed: true,
      state: {
        confirmed: false,
        confirmedAt: null,
        entryCount: 12,
        titles: { crni_kralj: 0, otmanovic: 1, bili_kralj: 0, bula: 1 },
      },
      nowIso,
    })
    expect(out).toEqual({
      ok: false,
      reason: 'titles',
      message: 'Postava nema crnog kralja. Postava nema bilog kralja.',
    })
  })

  it('confirms a postava that carries all four titles', () => {
    expect(
      decideConfirmation({
        confirmed: true,
        state: { confirmed: false, confirmedAt: null, entryCount: 12, titles: ALL },
        nowIso,
      }),
    ).toEqual({ ok: true, confirmed: true, confirmedAt: nowIso })
  })

  it('unlocks whatever the state is, and clears the stamp', () => {
    for (const state of [
      { confirmed: true, confirmedAt: '2026-01-01T00:00:00.000Z', entryCount: 4, titles: ALL },
      // Unlocking is never refused for a missing title: an evening confirmed
      // before the rule existed has to be openable to be repaired (#566).
      { confirmed: false, confirmedAt: null, entryCount: 0, titles: NONE },
    ]) {
      expect(decideConfirmation({ confirmed: false, state, nowIso })).toEqual({
        ok: true,
        confirmed: false,
        confirmedAt: null,
      })
    }
  })
})

describe('setLineupConfirmationInTransaction', () => {
  it('takes the SAME lock the replace takes, before writing', async () => {
    const { store, rec } = fakeStore({
      confirmed: false,
      confirmedAt: null,
      entryCount: 2,
      titles: ALL,
    })
    const outcome = await setLineupConfirmationInTransaction(
      '10',
      true,
      store,
      () => new Date('2026-08-06T08:00:00.000Z'),
    )
    expect(outcome).toEqual({
      ok: true,
      confirmed: true,
      confirmedAt: '2026-08-06T08:00:00.000Z',
    })
    expect(rec.log).toEqual(['begin', 'lock:tx-1', 'confirm:tx-1:true', 'commit:tx-1'])
  })

  it('writes nothing when the postava is empty', async () => {
    const { store, rec } = fakeStore(draft)
    const outcome = await setLineupConfirmationInTransaction('10', true, store)
    expect(outcome).toEqual({ ok: false, reason: 'empty' })
    expect(rec.log).toEqual(['begin', 'lock:tx-1', 'rollback:tx-1'])
    expect(rec.confirmation.confirmed).toBe(false)
  })

  it('writes nothing when the performance is gone', async () => {
    const { store, rec } = fakeStore(null)
    expect(await setLineupConfirmationInTransaction('10', false, store)).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(rec.log).toEqual(['begin', 'lock:tx-1', 'rollback:tx-1'])
  })
})
