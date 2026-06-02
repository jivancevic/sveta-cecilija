// Partner / admin storno (cancellation) authorization + window (ADR-0008, #145).
//
// Storno cancels tickets that were issued in error. Two actors, two policies:
//   - A partner may storno only its OWN order, and only on the SAME calendar day
//     the order was created, in Europe/Zagreb (the venue's wall-clock day). The
//     window closes at the next Zagreb midnight, so a sale at 23:50 can still be
//     undone at 23:59 but not at 00:10 the next day.
//   - An admin (admin/superadmin tier) may storno any order at any time, with no
//     window and no ownership constraint.
//
// Pure + DI: the clock (`now`) and the actor/ownership facts are INJECTED by the
// route from the authenticated session — never read from the wall clock or
// trusted from the request body here. The actual DB mutation is delegated to an
// injected void primitive (whole-order or single-ticket), which is idempotent
// and race-safe (WHERE status='active'). Because seats derive from active
// tickets, a successful storno frees the seat automatically and excludes the
// ticket from stats/reconciliation.

export type StornoErrorCode = 'NOT_OWNER' | 'WINDOW_CLOSED' | 'NOTHING_TO_VOID'

export class StornoError extends Error {
  constructor(
    public readonly code: StornoErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'StornoError'
  }
}

export type StornoActor =
  | { kind: 'admin' }
  | { kind: 'partner'; partnerId: number | string }

export type StornoTarget =
  | { kind: 'order' }
  | { kind: 'ticket'; ticketId: string }

export interface StornoInput {
  /** When the order was created (its issuance instant). */
  orderCreatedAt: Date | string
  /** Injected clock — the moment the storno is attempted. Never read here. */
  now: Date | string
  /** Who is attempting the storno, derived server-side from the session. */
  actor: StornoActor
  /** The partner that owns the target order (its `partner_id`), or null/none. */
  orderPartnerId: number | string | null | undefined
  /** Whole order or a single ticket under it. */
  target: StornoTarget
}

export interface StornoDeps {
  /** Void all active tickets of the order; returns how many were newly voided. */
  voidOrder: () => Promise<number>
  /** Void one active ticket; returns how many were newly voided (0 or 1). */
  voidTicket: (ticketId: string) => Promise<number>
}

export interface StornoResult {
  voided: number
}

const ZAGREB_TZ = 'Europe/Zagreb'

// Calendar date (YYYY-MM-DD) of an instant in Europe/Zagreb. 'en-CA' yields the
// ISO-ordered form natively, and the timeZone option does the DST-aware shift,
// so this is correct across the spring-forward / fall-back boundaries.
function zagrebDate(instant: Date | string): string {
  const d = instant instanceof Date ? instant : new Date(instant)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZAGREB_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** True iff `now` falls on the same Europe/Zagreb calendar day as `createdAt`. */
export function isSameZagrebDay(createdAt: Date | string, now: Date | string): boolean {
  return zagrebDate(createdAt) === zagrebDate(now)
}

/**
 * Authorize and perform a storno. Returns how many tickets were voided. Throws
 * a typed StornoError on a policy or no-op failure:
 *   - NOT_OWNER: a partner targeting an order it doesn't own.
 *   - WINDOW_CLOSED: a partner past the same-day Europe/Zagreb window.
 *   - NOTHING_TO_VOID: authorized, but no active ticket matched (already
 *     cancelled, or unknown ticket id) — the route maps this to 409.
 */
export async function performStorno(input: StornoInput, deps: StornoDeps): Promise<StornoResult> {
  const { actor, orderPartnerId, orderCreatedAt, now, target } = input

  if (actor.kind === 'partner') {
    // Ownership first: a partner must never learn anything about another
    // partner's order, so this is checked before the window.
    if (orderPartnerId == null || String(orderPartnerId) !== String(actor.partnerId)) {
      throw new StornoError('NOT_OWNER', 'You can only cancel your own sales')
    }
    if (!isSameZagrebDay(orderCreatedAt, now)) {
      throw new StornoError(
        'WINDOW_CLOSED',
        'This sale can no longer be cancelled — same-day only. Please contact HGD Sveta Cecilija.',
      )
    }
  }
  // Admin: no ownership and no window constraints.

  const voided =
    target.kind === 'ticket' ? await deps.voidTicket(target.ticketId) : await deps.voidOrder()

  if (voided === 0) {
    throw new StornoError('NOTHING_TO_VOID', 'Nothing to cancel — these tickets are already cancelled')
  }

  return { voided }
}
