// Self-issued comps: the rules a moreškant's own free tickets obey (#434,
// ADR-0019 × ADR-0024 phase 4). Glossary: CONTEXT.md → *Moreškant comp*.
//
// A dancer issuing tickets for their mother is a COMP, not a new kind of sale:
// the order is `channel='comp'`, `total=0`, attributed to their Member row, and
// it is written by the one comp engine (`create-comp-issue.ts`) through the same
// per-show sell lock and the same ticket email. What is new here is who may do
// it and how many, so this module holds exactly that and nothing else:
//
//   - the cap — four ACTIVE self-issued tickets per performance per dancer, and
//     admin comps for the same Member never count against it (#430, story 52);
//   - the four refusals a dancer can hit (no Member link, no e-mail, a
//     non-public / cancelled / already started performance);
//   - the cancel scope — the whole order, own, self-issued, unscanned, before
//     the start.
//
// Pure and DI'd in the `push/alarm.ts` route-half shape: the handlers return
// `{ status, body }` and the routes only wire Payload to them. The cap COUNT is
// a dep rather than an argument on purpose — the route calls it from inside the
// sell lock (as `guard`), so two taps a millisecond apart cannot both read
// "three issued" and both pass (#430, story 48 × 66).

import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS } from '@/lib/app/strings'
import { showStartMs } from '@/lib/show-time'

/** Tickets one dancer may hold on one performance from their OWN hand. */
export const SELF_COMP_CAP = 4

/** The printed HOLDER name is a line on a slip, not an essay. */
export const MAX_SELF_COMP_NAME = 80

/** The caller, once their Member link has been resolved and read. */
export interface SelfCompActor {
  memberId: string
  /** The Member's full name: the default for "Ime na karti" (story 49). */
  name: string | null
  /** The Member's e-mail: where the PDF goes. No e-mail, no comps (story 50). */
  email: string | null
}

/** What the rules need to know about the evening. */
export interface SelfCompPerformance {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, Europe/Zagreb wall clock. */
  time: string
  cancelled: boolean
  /** ADR-0024: only a public performance sells seats, so only it has comps. */
  isPublic: boolean
}

/** The order a cancel is aimed at, as the caller's own records describe it. */
export interface SelfCompOrder {
  id: string
  channel: string
  /** 'self' | 'admin' | null; NULL predates the column and means 'admin'. */
  compIssuedBy: string | null
  /** The Member the comp is attributed to. */
  memberId: string | null
  /** True when ANY ticket of the order has been through the door. */
  anyScanned: boolean
  performance: SelfCompPerformance | null
}

/** How the engine answered, mapped by the route so this module stays pure. */
export type SelfCompIssueOutcome =
  | {
      ok: true
      orderId: string
      code: string
      ticketCount: number
      /** 'sent' | 'skipped' | 'failed', straight from the ticket email. */
      emailStatus: string
    }
  | { ok: false; reason: 'cap' | 'oversell' | 'rejected' }

export interface SelfCompIssueBody {
  performanceId?: unknown
  adults?: unknown
  children?: unknown
  buyerName?: unknown
}

export interface SelfCompIssueDeps {
  request: AppRequestMeta
  /** Null when the login carries no Member link (story 55). */
  actor: SelfCompActor | null
  loadPerformance: (id: string) => Promise<SelfCompPerformance | null>
  /**
   * The caller's ACTIVE self-issued comp tickets on this performance.
   *
   * Called by `guard` below, which the route runs INSIDE the per-show sell lock.
   */
  countOwnSelfComps: (performanceId: string) => Promise<number>
  /**
   * Run the comp engine. `guard` must be awaited inside the seat lock, before
   * the capacity check commits anything; it throws `SelfCompCapError` when the
   * request would breach the four, which the route maps to `reason: 'cap'`.
   */
  issue: (args: {
    performanceId: string
    adults: number
    children: number
    buyerName: string | null
    email: string
    guard: () => Promise<void>
  }) => Promise<SelfCompIssueOutcome>
  now?: () => Date
}

export interface SelfCompCancelBody {
  orderId?: unknown
}

export interface SelfCompCancelDeps {
  request: AppRequestMeta
  actor: SelfCompActor | null
  loadOrder: (orderId: string) => Promise<SelfCompOrder | null>
  /** Void every still-active ticket of the order; returns how many went. */
  voidOrder: (orderId: string) => Promise<number>
  now?: () => Date
}

export interface SelfCompResult {
  status: number
  body: Record<string, unknown>
}

/** Thrown by the cap guard inside the seat lock; the route maps it to 'cap'. */
export class SelfCompCapError extends Error {
  constructor() {
    super('Self-issued comp cap reached')
    this.name = 'SelfCompCapError'
  }
}

/** Tickets this dancer may still issue for this performance. Never negative. */
export function selfCompRemaining(alreadyIssued: number): number {
  return Math.max(0, SELF_COMP_CAP - Math.max(0, alreadyIssued))
}

/**
 * THE cap rule. `alreadyIssued` counts only ACTIVE, SELF-issued tickets, so a
 * cancelled comp gives its allowance back and an admin's gift never eats it.
 */
export function selfCompCapExceeded(alreadyIssued: number, requested: number): boolean {
  return alreadyIssued + requested > SELF_COMP_CAP
}

/** '  Ana  Marić ' → 'Ana Marić'; longer than the cap is trimmed, not refused. */
export function normaliseHolderName(value: unknown, fallback: string | null): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  const name = raw || (fallback ?? '').trim()
  return name ? name.slice(0, MAX_SELF_COMP_NAME) : null
}

function idOf(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function count(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(n) || n < 0 || n > SELF_COMP_CAP) return null
  return n
}

/**
 * Whether this evening can still take (or give back) a dancer's own comps.
 *
 * One function for both routes, because the section a dancer sees and the two
 * POSTs enforce the same three sentences.
 */
export function selfCompWindow(
  performance: SelfCompPerformance,
  nowMs: number,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!performance.isPublic) {
    return { ok: false, status: 400, error: APP_STRINGS.comp.notPublic }
  }
  if (performance.cancelled) {
    return { ok: false, status: 400, error: APP_STRINGS.comp.showCancelled }
  }
  const startMs = showStartMs(performance.date, performance.time)
  // A performance with no usable start instant is treated as still ahead: the
  // capacity guard and the door remain the real limits, and refusing on a
  // malformed row would lock a dancer out of a perfectly good evening.
  if (!Number.isNaN(startMs) && nowMs >= startMs) {
    return { ok: false, status: 409, error: APP_STRINGS.comp.started }
  }
  return { ok: true }
}

/** POST /api/app/comp/issue. `requirePermission(req, 'moreskant')` is the route's job. */
export async function handleSelfCompIssue(
  body: SelfCompIssueBody | null | undefined,
  deps: SelfCompIssueDeps,
): Promise<SelfCompResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.comp.rejected } }

  // Story 55: a voditelj without a Member link has nobody to attribute a comp
  // to, so the section is absent AND the route refuses. 403, not 400: the
  // request is well formed, this account may simply not do it.
  if (!deps.actor) return { status: 403, body: { error: APP_STRINGS.comp.noMember } }
  const email = deps.actor.email?.trim()
  if (!email) return { status: 400, body: { error: APP_STRINGS.comp.noEmail } }

  const performanceId = idOf(body?.performanceId)
  if (!performanceId) return { status: 400, body: { error: APP_STRINGS.comp.notFound } }

  const adults = count(body?.adults)
  const children = count(body?.children)
  if (adults === null || children === null) {
    return { status: 400, body: { error: APP_STRINGS.comp.pickOne } }
  }
  const requested = adults + children
  if (requested === 0) return { status: 400, body: { error: APP_STRINGS.comp.pickOne } }
  // The cap as a shape check: a request for five can never be right, whatever
  // the dancer has already issued. The authoritative check is the guard below.
  if (requested > SELF_COMP_CAP) {
    return { status: 409, body: { error: APP_STRINGS.comp.capReached } }
  }

  const performance = await deps.loadPerformance(performanceId)
  if (!performance) return { status: 400, body: { error: APP_STRINGS.comp.notFound } }

  const nowMs = (deps.now?.() ?? new Date()).getTime()
  const window = selfCompWindow(performance, nowMs)
  if (!window.ok) return { status: window.status, body: { error: window.error } }

  const outcome = await deps.issue({
    performanceId,
    adults,
    children,
    buyerName: normaliseHolderName(body?.buyerName, deps.actor.name),
    email,
    // Runs inside the per-show sell lock, next to the capacity check, so the
    // count a decision is made on is the count no concurrent tap can change.
    guard: async () => {
      const already = await deps.countOwnSelfComps(performanceId)
      if (selfCompCapExceeded(already, requested)) throw new SelfCompCapError()
    },
  })

  if (!outcome.ok) {
    if (outcome.reason === 'cap') {
      return { status: 409, body: { error: APP_STRINGS.comp.capReached } }
    }
    if (outcome.reason === 'oversell') {
      return { status: 409, body: { error: APP_STRINGS.comp.soldOut } }
    }
    return { status: 400, body: { error: APP_STRINGS.comp.failed } }
  }

  return {
    status: 200,
    body: {
      ok: true,
      orderId: outcome.orderId,
      code: outcome.code,
      ticketCount: outcome.ticketCount,
      emailStatus: outcome.emailStatus,
    },
  }
}

/** POST /api/app/comp/cancel. Whole order only (#430, Out of Scope). */
export async function handleSelfCompCancel(
  body: SelfCompCancelBody | null | undefined,
  deps: SelfCompCancelDeps,
): Promise<SelfCompResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.comp.rejected } }

  if (!deps.actor) return { status: 403, body: { error: APP_STRINGS.comp.noMember } }

  const orderId = idOf(body?.orderId)
  if (!orderId) return { status: 400, body: { error: APP_STRINGS.comp.notFound } }

  const order = await deps.loadOrder(orderId)
  if (!order) return { status: 404, body: { error: APP_STRINGS.comp.notFound } }

  // A paid online order and an admin comp are both somebody else's business:
  // /app cancels only what /app issued (#430, Out of Scope).
  if (order.channel !== 'comp' || order.compIssuedBy !== 'self') {
    return { status: 400, body: { error: APP_STRINGS.comp.notYours } }
  }
  if (order.memberId == null || String(order.memberId) !== deps.actor.memberId) {
    return { status: 403, body: { error: APP_STRINGS.comp.notYours } }
  }

  // Someone is already inside on this slip. Voiding it would free a seat that
  // is physically taken, so the door wins over the app.
  if (order.anyScanned) return { status: 409, body: { error: APP_STRINGS.comp.scanned } }

  if (order.performance) {
    const nowMs = (deps.now?.() ?? new Date()).getTime()
    const startMs = showStartMs(order.performance.date, order.performance.time)
    if (!Number.isNaN(startMs) && nowMs >= startMs) {
      return { status: 409, body: { error: APP_STRINGS.comp.started } }
    }
  }

  const voided = await deps.voidOrder(orderId)
  // Already cancelled: nothing moved, and there is nothing to tell the dancer
  // that is not already true on their screen after a refresh.
  if (voided === 0) return { status: 409, body: { error: APP_STRINGS.comp.notFound } }

  return { status: 200, body: { ok: true, voided } }
}
