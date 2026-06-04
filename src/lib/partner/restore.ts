// Partner / admin restore (un-storno) authorization + window (ADR-0017, #146).
//
// Restore is the only un-void path: it re-activates tickets a storno just
// cancelled, so the partner dashboard's delete-then-undo can put seats back.
// Two actors, two policies — mirroring performStorno exactly:
//   - A partner may restore only its OWN order, and only within the SAME
//     Europe/Zagreb day the order was created (the storno window). The undo
//     banner is short-lived, so in practice this is always satisfied, but the
//     server re-checks it so a stale request can't reopen a closed window.
//   - An admin may restore any order at any time — no ownership, no window.
//
// Beyond authz, restore is capacity-bounded: re-activating tickets re-takes
// seats, so a seat freed by the storno may have been resold in the interim.
// That race is owned by `deps.restore`, which runs the count→capacity-check→
// reactivate critical section under the per-show sell lock (mirroring
// createPartnerSale) and rejects with a SEAT_TAKEN marker if the seat is gone.
// This module stays pure + DI: the clock, the actor/ownership facts, and the
// locked DB mutation are all INJECTED by the route.

export type RestoreErrorCode = 'NOT_OWNER' | 'WINDOW_CLOSED' | 'SEAT_TAKEN' | 'NOTHING_TO_RESTORE'

export class RestoreError extends Error {
  constructor(
    public readonly code: RestoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RestoreError'
  }
}

export type RestoreActor =
  | { kind: 'admin' }
  | { kind: 'partner'; partnerId: number | string }

export type RestoreTarget =
  | { kind: 'order' }
  | { kind: 'ticket'; ticketId: string }

export interface RestoreInput {
  /** When the order was created (its issuance instant) — the window anchor. */
  orderCreatedAt: Date | string
  /** Injected clock — the moment the restore is attempted. Never read here. */
  now: Date | string
  /** Who is attempting the restore, derived server-side from the session. */
  actor: RestoreActor
  /** The partner that owns the target order (its `partner_id`), or null/none. */
  orderPartnerId: number | string | null | undefined
  /** Whole order or a single ticket under it. */
  target: RestoreTarget
}

// Sentinel the locked restore closure rejects with when the freed seat was
// retaken before the undo landed. performRestore maps it to RestoreError.
export const SEAT_TAKEN = 'SEAT_TAKEN'

export interface RestoreDeps {
  /**
   * Run the locked capacity-check + reactivate and return how many tickets were
   * restored. MUST take the per-show sell lock so a concurrent sell can't be
   * oversold. Rejects with the SEAT_TAKEN sentinel when the freed seat was
   * retaken in the interim; resolves 0 when nothing matched (already active /
   * unknown / not a storno cancellation).
   */
  restore: () => Promise<number>
}

export interface RestoreResult {
  restored: number
}

// Same-day Europe/Zagreb predicate is owned by the storno module — reuse it so
// the restore window can never drift from the storno window it mirrors.
import { isSameZagrebDay } from './storno'

function isSeatTaken(err: unknown): boolean {
  return (
    err === SEAT_TAKEN ||
    (err instanceof Error && err.message === SEAT_TAKEN) ||
    (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === SEAT_TAKEN)
  )
}

/**
 * Authorize and perform a restore (un-storno). Returns how many tickets were
 * re-activated. Throws a typed RestoreError on a policy, capacity, or no-op
 * failure:
 *   - NOT_OWNER: a partner targeting an order it doesn't own.
 *   - WINDOW_CLOSED: a partner past the same-day Europe/Zagreb window.
 *   - SEAT_TAKEN: the freed seat was resold before the undo landed (soft fail).
 *   - NOTHING_TO_RESTORE: authorized, but no storno-cancelled ticket matched
 *     (already active, unknown id, or a refund void) — the route maps to 409.
 */
export async function performRestore(input: RestoreInput, deps: RestoreDeps): Promise<RestoreResult> {
  const { actor, orderPartnerId, orderCreatedAt, now } = input

  if (actor.kind === 'partner') {
    // Ownership first: a partner must never learn anything about another
    // partner's order, so this is checked before the window.
    if (orderPartnerId == null || String(orderPartnerId) !== String(actor.partnerId)) {
      throw new RestoreError('NOT_OWNER', 'You can only undo your own sales')
    }
    if (!isSameZagrebDay(orderCreatedAt, now)) {
      throw new RestoreError(
        'WINDOW_CLOSED',
        'This cancellation can no longer be undone — same-day only. Please contact HGD Sveta Cecilija.',
      )
    }
  }
  // Admin: no ownership and no window constraints.

  let restored: number
  try {
    restored = await deps.restore()
  } catch (err) {
    if (isSeatTaken(err)) {
      throw new RestoreError('SEAT_TAKEN', 'Could not undo — the seat has already been taken')
    }
    throw err
  }

  if (restored === 0) {
    throw new RestoreError(
      'NOTHING_TO_RESTORE',
      'Nothing to undo — these tickets are not cancelled',
    )
  }

  return { restored }
}
