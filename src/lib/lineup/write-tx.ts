// The two lineup writes as ONE serialized critical section (#432, #442 review).
//
// THE RACE THIS EXISTS FOR. Both writes read `shows.lineupConfirmed` and then
// act on it, and the read and the act are separate statements. With no lock:
//
//   - a Potvrdi landing between a Spremi's 409 check and its inserts leaves a
//     CONFIRMED evening holding the list the voditelj was still editing — the
//     one thing "Potvrdi locks it" promises cannot happen;
//   - two concurrent replaces interleave their delete and their inserts, and
//     the result is either the union of both lists or a 500 from the unique
//     (performance, member) index;
//   - a re-confirm reading "not confirmed" twice re-stamps `lineupConfirmedAt`.
//
// So the confirmation flag is read `FOR UPDATE` on the shows row, INSIDE the
// transaction that then writes, and both routes take that same row lock in the
// same order. The second writer blocks until the first commits and then reads
// the truth rather than a memory of it. This is the `withShowSellLock` lesson
// (#179) applied to a race that a row lock can express directly, because unlike
// a seat sell both halves here touch the very row being locked.
//
// Everything below is pure over an injected executor, so the ORDER (lock →
// re-check → write → commit, rollback on any refusal) is unit-testable with a
// fake that flips the flag between the pre-check and the locked read — the only
// way to test a race without a race.

import type { PerformanceKind } from '@/lib/show-performance'
import type { LineupEntry } from './rules'
import { checkLineup, type TitleCounts } from './titles'

/** What a write decided. `confirmed` is the 409; `missing` the 400. */
export type LineupWriteOutcome =
  | { written: true }
  | { written: false; reason: 'confirmed' | 'missing' }

/** The confirmation as it stands on the locked row. */
export interface LockedLineupState {
  confirmed: boolean
  /** ISO, or null when the evening has never been confirmed. */
  confirmedAt: string | null
  /**
   * What KIND of evening this is (#620).
   *
   * Read under the lock with everything else, because what a confirmed postava
   * must carry depends on it: an Experience needs a voditelj and no titles,
   * every other kind needs the four titles. A kind read outside the lock would
   * be a second opinion about the row being written.
   */
  kind: PerformanceKind
  /** How many rows the postava holds right now. */
  entryCount: number
  /**
   * How many `voditelj` rows the postava holds right now (#620).
   *
   * The other half of the kind split, counted off the same grouped query the
   * titles come from: on an Experience this is the number the confirmation
   * rule asks for, and on every other kind the lineup route has already refused
   * the row, so it is zero by construction.
   */
  voditelji: number
  /**
   * How many dancers wear each of the four titles right now (#566).
   *
   * Read under the SAME lock as the flag, because "exactly one crni kralj" is a
   * statement about the moment of the confirmation and nothing else: a Spremi
   * landing between a count and a confirm would otherwise lock an evening whose
   * titles were checked against a list that is no longer there.
   */
  titles: TitleCounts
}

/**
 * The minimum of a transactional store these two operations need.
 *
 * `tx` is whatever the caller's transaction handle is (Payload hands back an
 * id; a test hands back nothing). It is threaded through rather than captured
 * so a fake can assert that every statement ran inside the same transaction.
 */
export interface LineupTxStore<Tx> {
  begin: () => Promise<Tx>
  commit: (tx: Tx) => Promise<void>
  rollback: (tx: Tx) => Promise<void>
  /**
   * `SELECT lineup_confirmed, lineup_confirmed_at FROM shows WHERE id = $1 FOR
   * UPDATE`, plus the row count of the postava — the locked read. Null when the
   * performance does not exist.
   */
  lockPerformance: (performanceId: string, tx: Tx) => Promise<LockedLineupState | null>
  deleteEntries: (performanceId: string, tx: Tx) => Promise<void>
  insertEntry: (performanceId: string, entry: LineupEntry, tx: Tx) => Promise<void>
  setConfirmation: (
    performanceId: string,
    confirmed: boolean,
    confirmedAt: string | null,
    tx: Tx,
  ) => Promise<void>
}

/**
 * Replace the whole postava of one performance.
 *
 * Lock, re-check, delete, insert, commit. The re-check under the lock is the
 * only one that counts: the handler's earlier read is a courtesy that saves a
 * transaction in the common case and proves nothing about the moment of the
 * write.
 */
export async function replaceLineupInTransaction<Tx>(
  performanceId: string,
  entries: readonly LineupEntry[],
  store: LineupTxStore<Tx>,
): Promise<LineupWriteOutcome> {
  const tx = await store.begin()
  try {
    const state = await store.lockPerformance(performanceId, tx)
    if (!state) {
      await store.rollback(tx)
      return { written: false, reason: 'missing' }
    }
    if (state.confirmed) {
      // A Potvrdi won the race. Nothing is written and the voditelj is told to
      // unlock, which is the same sentence the pre-check would have given.
      await store.rollback(tx)
      return { written: false, reason: 'confirmed' }
    }

    await store.deleteEntries(performanceId, tx)
    for (const entry of entries) {
      await store.insertEntry(performanceId, entry, tx)
    }
    await store.commit(tx)
    return { written: true }
  } catch (err) {
    await store.rollback(tx).catch(() => {})
    throw err
  }
}

/**
 * What a confirm decided. `empty` is a 400: an empty postava confirms nothing,
 * and `titles` is the other 400, which carries its own sentence because the
 * only useful thing to say about it is WHICH title is missing or doubled.
 */
export type LineupConfirmOutcome =
  | { ok: true; confirmed: boolean; confirmedAt: string | null }
  | { ok: false; reason: 'missing' | 'empty' }
  /**
   * The postava does not carry what this kind of evening needs (#620): either
   * the four titles or the one voditelj. Two reasons rather than one, because
   * the sentence explaining the RULE differs and a Croatian explanation about
   * four titles under a complaint about a missing voditelj is worse than none.
   */
  | { ok: false; reason: 'titles' | 'voditelj'; message: string }

/**
 * The confirmation RULE, pure over the locked state.
 *
 * Two decisions live here rather than in the SQL:
 *
 * - **An empty postava may not be confirmed.** "Confirmed" is what publishes a
 *   lineup to the roster and what lets it count in the season statistics, and
 *   an evening confirmed with nobody in it says neither "these danced" nor
 *   "nobody danced" — it only makes a dancer read "još nije objavljena" about a
 *   lineup that is, in fact, final.
 * - **Re-confirming does not re-stamp.** `lineupConfirmedAt` records when the
 *   postava became final; a second tap on a button that is already pressed is
 *   not a second decision. Unlocking clears it, so the timestamp never outlives
 *   the confirmation it records.
 * - **What the postava must CARRY depends on the kind** (#566, split by kind in
 *   #620; glossary: *Title*, *Voditelj (u postavi)*). A confirmed postava is the
 *   evening as it was danced: a moreška has one crni kralj, one otmanović, one
 *   bili kralj and one bula, and a Moreška Experience has the one member who
 *   ran it. `checkLineup` owns that split; this function only asks it. The rule
 *   applies HERE and nowhere else on the way in: an unconfirmed replace, the MCP
 *   `set_lineup` included, has to stay writable while the voditelj is halfway
 *   through. Unlocking is never refused for it either, or an evening confirmed
 *   before this rule existed could not be opened to be repaired.
 */
export function decideConfirmation(input: {
  /** What the caller asked for. */
  confirmed: boolean
  state: LockedLineupState
  nowIso: string
}): LineupConfirmOutcome {
  if (!input.confirmed) {
    return { ok: true, confirmed: false, confirmedAt: null }
  }
  if (input.state.entryCount === 0) {
    return { ok: false, reason: 'empty' }
  }
  const rule = checkLineup({
    kind: input.state.kind,
    titles: input.state.titles,
    voditelji: input.state.voditelji,
  })
  if (!rule.ok) {
    return { ok: false, reason: rule.needed, message: rule.message }
  }
  return {
    ok: true,
    confirmed: true,
    confirmedAt: input.state.confirmed
      ? (input.state.confirmedAt ?? input.nowIso)
      : input.nowIso,
  }
}

/**
 * Confirm or unlock one performance, under the same row lock the replace takes.
 *
 * Same order, same row: that is what makes the two operations serialize with
 * each other rather than merely each with themselves.
 */
export async function setLineupConfirmationInTransaction<Tx>(
  performanceId: string,
  confirmed: boolean,
  store: LineupTxStore<Tx>,
  now: () => Date = () => new Date(),
): Promise<LineupConfirmOutcome> {
  const tx = await store.begin()
  try {
    const state = await store.lockPerformance(performanceId, tx)
    if (!state) {
      await store.rollback(tx)
      return { ok: false, reason: 'missing' }
    }

    const decision = decideConfirmation({ confirmed, state, nowIso: now().toISOString() })
    if (!decision.ok) {
      await store.rollback(tx)
      return decision
    }

    await store.setConfirmation(performanceId, decision.confirmed, decision.confirmedAt, tx)
    await store.commit(tx)
    return decision
  } catch (err) {
    await store.rollback(tx).catch(() => {})
    throw err
  }
}
