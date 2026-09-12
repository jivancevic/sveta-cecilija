// The IO wiring behind a moreškant's own comps (#434) — the `push-data.ts` shape:
// the Payload calls, the pool and the ticket email, so `src/lib/comp/self-comp.ts`
// stays a pure rule set and the two routes stay adapters.
//
// The one thing worth reading twice is `issueSelfComp`: it does NOT write an
// order. It calls the SAME comp engine `/api/comp/issue` calls
// (`createCompIssue`), with the same per-show advisory lock, the same order-code
// generator, the same QR tokens and the same ticket email (#430, story 54).
// There is exactly one ticket writer in this codebase and this is not a second
// one — the only things added are `compIssuedBy: 'self'`, the `member` forced to
// the caller, and the cap check slipped inside the lock the engine already takes.

import { relationIdString } from '@/lib/payload-relation'
import { isActiveMoreskant } from '@/lib/app/access'
import { resolveOwnMemberId, type MemberLinkReader } from '@/lib/access/attendance-access'
import { createCompIssue, CompIssueError } from '@/lib/comp/create-comp-issue'
import { buildCompIssueDeps } from '@/lib/comp/comp-issue-deps'
import {
  SelfCompCapError,
  type SelfCompActor,
  type SelfCompCancelContext,
  type SelfCompIssueOutcome,
  type SelfCompOrder,
  type SelfCompPerformance,
} from '@/lib/comp/self-comp'
import { sendOrderTicketEmail, type OrderEmailPayload } from '@/lib/email/send-order-ticket-email'
import { isPublicPerformance } from '@/lib/show-performance'
import { remainingSeats } from '@/lib/tickets/seat-availability'
import {
  getActiveTicketCountForShow,
  getSelfCompTicketCount,
  type PoolQuery,
} from '@/lib/tickets/sold-seats'
import { voidOrderTickets, type TicketVoidExecutor } from '@/lib/tickets/ticket-void'
import { toIsoDate } from '@/lib/to-iso-date'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'

/** The slice of Payload's local API this module uses. */
export interface CompPayload {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<{ id: string | number }>
  db: unknown
}

type CompPool = { query: PoolQuery }

function poolOf(payload: CompPayload): CompPool {
  return (payload.db as { pool: CompPool }).pool
}

function drizzleOf(payload: CompPayload): TicketVoidExecutor {
  return (payload.db as { drizzle: TicketVoidExecutor }).drizzle
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** A shows doc → the four facts the comp rules read. */
export function toSelfCompPerformance(doc: Record<string, unknown>): SelfCompPerformance {
  return {
    id: String(doc.id),
    date: toIsoDate(doc.date),
    time: typeof doc.time === 'string' ? doc.time : '',
    cancelled: doc.status === 'cancelled',
    isPublic: isPublicPerformance(doc),
  }
}

/**
 * The caller as a comp recipient, or null when they are not one.
 *
 * The SAME resolution the `/app` access decision uses: the Member link is
 * field-locked to `users`, so it is re-read with `overrideAccess`, and the row
 * has to clear the live-dancer bar (`isActiveMoreskant`) — a retired Member is
 * off the roster, not a comp account. A voditelj with no link resolves to null,
 * which is story 55 in one return value.
 */
export async function resolveSelfCompActor(
  payload: CompPayload,
  user: { id?: string | number; member?: unknown } | null | undefined,
): Promise<SelfCompActor | null> {
  const memberId = await resolveOwnMemberId(payload as unknown as MemberLinkReader, user)
  if (memberId == null) return null
  try {
    const doc = (await payload.findByID({
      collection: 'members',
      id: memberId,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown> | null
    if (!doc) return null
    if (!isActiveMoreskant({ id: String(doc.id), ...doc } as never)) return null
    return {
      memberId: String(doc.id),
      name: text(doc.name),
      // The Member's e-mail never reaches an `/app` payload (ADR-0024's PII
      // boundary); it is read here only to address the envelope.
      email: text(doc.email),
    }
  } catch {
    return null
  }
}

export async function loadSelfCompPerformance(
  payload: CompPayload,
  id: string,
): Promise<SelfCompPerformance | null> {
  try {
    const doc = (await payload.findByID({
      collection: 'shows',
      id,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown> | null
    return doc ? toSelfCompPerformance(doc) : null
  } catch {
    return null
  }
}

function channelOf(value: unknown): SelfCompOrder['channel'] {
  return value === 'partner' || value === 'comp' ? value : 'online'
}

function issuedByOf(value: unknown): SelfCompOrder['compIssuedBy'] {
  return value === 'self' || value === 'admin' ? value : null
}

/**
 * The order, and nothing that costs a second query.
 *
 * The ownership test runs on this alone, so an id that is not the caller's own
 * self-issued comp is refused before any ticket or show is read.
 */
export async function loadSelfCompOrder(
  payload: CompPayload,
  orderId: string,
): Promise<(SelfCompOrder & { showId: string | null }) | null> {
  let doc: Record<string, unknown> | null = null
  try {
    doc = (await payload.findByID({
      collection: 'orders',
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown> | null
  } catch {
    return null
  }
  if (!doc) return null

  return {
    id: String(doc.id),
    channel: channelOf(doc.channel),
    compIssuedBy: issuedByOf(doc.compIssuedBy),
    memberId: relationIdString(doc.member),
    showId: relationIdString(doc.show),
  }
}

/** The scan and the evening, read only for an order the caller already owns. */
export async function loadSelfCompCancelContext(
  payload: CompPayload,
  order: SelfCompOrder & { showId?: string | null },
): Promise<SelfCompCancelContext> {
  const [scanned, performance] = await Promise.all([
    payload.find({
      collection: 'tickets',
      where: { and: [{ order: { equals: order.id } }, { scanned: { equals: true } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    order.showId ? loadSelfCompPerformance(payload, order.showId) : Promise.resolve(null),
  ])
  return { anyScanned: scanned.docs.length > 0, performance }
}

/** Void every still-active ticket of the order (reason 'storno'), as /admin does. */
export async function voidSelfCompOrder(payload: CompPayload, orderId: string): Promise<number> {
  const { voided } = await voidOrderTickets(drizzleOf(payload), orderId, 'storno')
  return voided
}

/**
 * Issue the comps through the shared engine, and mail the PDF.
 *
 * `guard` (the cap check) is run inside `withShowSellLock`, wrapping the
 * engine's own critical section: the lock is taken once, the dancer's tally and
 * the room's capacity are read under it, and the tickets are written before it
 * is released. Two taps a millisecond apart therefore queue rather than race.
 */
export interface IssueSelfCompDeps {
  /** Seam for tests; defaults to the real Brevo-backed ticket email. */
  sendEmail?: typeof sendOrderTicketEmail
}

/**
 * Issue the comps through the shared engine, and mail the PDF.
 *
 * `guard` (the cap check) is run inside `withShowSellLock`, wrapping the
 * engine's own critical section: the lock is taken once, the dancer's tally and
 * the room's capacity are read under it, and the tickets are written before it
 * is released. Two taps a millisecond apart therefore queue rather than race.
 */
export async function issueSelfComp(
  payload: CompPayload,
  args: {
    memberId: string
    performanceId: string
    adults: number
    children: number
    buyerName: string | null
    email: string
    guard: () => Promise<void>
  },
  deps: IssueSelfCompDeps = {},
): Promise<SelfCompIssueOutcome> {
  const memberId = Number(args.memberId)
  const showId = Number(args.performanceId)
  if (!Number.isFinite(memberId) || !Number.isFinite(showId)) {
    return { ok: false, reason: 'rejected' }
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })

  let result
  try {
    result = await createCompIssue(
      {
        memberId,
        showId,
        adults: args.adults,
        children: args.children,
        today,
        buyerName: args.buyerName,
        email: args.email,
        locale: 'hr',
      },
      // The SAME wiring /api/comp/issue uses; the two things this caller adds
      // are the marker and the cap, and `wrapLock` is what puts the cap check
      // inside the seat lock rather than before it.
      buildCompIssueDeps(payload, {
        memberId,
        compIssuedBy: 'self',
        wrapLock: args.guard,
      }),
    )
  } catch (err) {
    if (err instanceof SelfCompCapError) return { ok: false, reason: 'cap' }
    if (err instanceof CompIssueError) {
      return { ok: false, reason: err.code === 'OVERSELL' ? 'oversell' : 'rejected' }
    }
    throw err
  }

  // Exactly what the admin route does, for the same reason: the order and its
  // tickets are already committed, `sendOrderTicketEmail` maps every failure to
  // a status rather than throwing, and awaiting it is what lets the answer say
  // whether the letter actually left. A dev laptop Brevo rejects therefore
  // reports `failed` and keeps the comps.
  const send = deps.sendEmail ?? sendOrderTicketEmail
  const email = await send(payload as unknown as OrderEmailPayload, result.orderId)

  return {
    ok: true,
    orderId: result.orderId,
    code: result.code,
    ticketCount: result.tickets.length,
    emailStatus: email.status,
  }
}

/**
 * Seats still sellable on a performance, or null when it has no capacity to
 * speak of (a non-public evening has no venue).
 *
 * The same arithmetic every other seat consumer uses — `VENUE_CAPACITY` minus
 * the active tickets minus the counters — through `remainingSeats`, so the
 * number the comp form respects is the number `/tickets` shows. It is advisory
 * only: the authoritative check is `assertCanSell` inside the sell lock.
 */
export async function loadSeatsRemaining(
  payload: CompPayload,
  performanceId: string,
): Promise<number | null> {
  let doc: Record<string, unknown> | null = null
  try {
    doc = (await payload.findByID({
      collection: 'shows',
      id: performanceId,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown> | null
  } catch {
    return null
  }
  if (!doc) return null
  const capacity = VENUE_CAPACITY[doc.venue as Venue]
  if (typeof capacity !== 'number') return null

  const pool = poolOf(payload)
  const activeTicketCount = await getActiveTicketCountForShow(
    (sql, params) => pool.query(sql, params),
    performanceId,
  )
  return remainingSeats({
    capacity,
    activeTicketCount,
    inPersonSold: (doc.inPersonSold as number) ?? 0,
    legacyReserved: (doc.legacyReserved as number) ?? 0,
  })
}

/** The caller's ACTIVE self-issued comp tickets on one performance. */
export function countOwnSelfComps(
  payload: CompPayload,
  performanceId: string,
  memberId: string,
): Promise<number> {
  const pool = poolOf(payload)
  return getSelfCompTicketCount((sql, params) => pool.query(sql, params), performanceId, memberId)
}
