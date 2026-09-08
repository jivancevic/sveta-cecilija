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

import { randomInt } from 'crypto'
import { relationIdString } from '@/lib/payload-relation'
import { isActiveMoreskant } from '@/lib/app/access'
import { resolveOwnMemberId, type MemberLinkReader } from '@/lib/access/attendance-access'
import {
  createCompIssue,
  CompIssueError,
  type CompIssueShow,
} from '@/lib/comp/create-comp-issue'
import {
  SelfCompCapError,
  type SelfCompActor,
  type SelfCompIssueOutcome,
  type SelfCompOrder,
  type SelfCompPerformance,
} from '@/lib/comp/self-comp'
import { sendOrderTicketEmail, type OrderEmailPayload } from '@/lib/email/send-order-ticket-email'
import { generateQrToken } from '@/lib/qr-token'
import { isPublicPerformance } from '@/lib/show-performance'
import { generateOrderCode as makeOrderCode } from '@/lib/tickets/order-code'
import { getActiveTicketCountForShow, getSelfCompTicketCount, type PoolQuery } from '@/lib/tickets/sold-seats'
import { withShowSellLock, type SellLockPool } from '@/lib/tickets/sell-lock'
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

type CompPool = { query: PoolQuery } & SellLockPool

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

/** One order plus the two facts a cancel refuses on: a scan, and the start. */
export async function loadSelfCompOrder(
  payload: CompPayload,
  orderId: string,
): Promise<SelfCompOrder | null> {
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

  const showId = relationIdString(doc.show)
  const [scanned, performance] = await Promise.all([
    payload.find({
      collection: 'tickets',
      where: { and: [{ order: { equals: doc.id } }, { scanned: { equals: true } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    showId ? loadSelfCompPerformance(payload, showId) : Promise.resolve(null),
  ])

  return {
    id: String(doc.id),
    channel: typeof doc.channel === 'string' ? doc.channel : 'online',
    compIssuedBy: typeof doc.compIssuedBy === 'string' ? doc.compIssuedBy : null,
    memberId: relationIdString(doc.member),
    anyScanned: scanned.docs.length > 0,
    performance,
  }
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
): Promise<SelfCompIssueOutcome> {
  const pool = poolOf(payload)
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
      {
        loadShow: async (id): Promise<CompIssueShow | null> => {
          const doc = (await payload
            .findByID({ collection: 'shows', id, depth: 0, overrideAccess: true })
            .catch(() => null)) as Record<string, unknown> | null
          if (!doc) return null
          return {
            id: Number(doc.id),
            date: toIsoDate(doc.date),
            status: doc.status === 'cancelled' ? 'cancelled' : 'active',
            isPublic: isPublicPerformance(doc),
            capacity: VENUE_CAPACITY[doc.venue as Venue],
            inPersonSold: (doc.inPersonSold as number) ?? 0,
            legacyReserved: (doc.legacyReserved as number) ?? 0,
          }
        },
        countActiveTickets: (id) =>
          getActiveTicketCountForShow((sql, params) => pool.query(sql, params), id),
        // The cap joins the capacity check under ONE lock (see the doc comment).
        withSeatLock: (sid, critical) =>
          withShowSellLock(pool, sid, async () => {
            await args.guard()
            return critical()
          }),
        generateOrderCode: () =>
          makeOrderCode({
            isUnique: async (code) => {
              const r = await payload.find({
                collection: 'orders',
                where: { code: { equals: code } },
                limit: 1,
                depth: 0,
                overrideAccess: true,
              })
              return r.docs.length === 0
            },
            randomInt: (max) => randomInt(max),
          }),
        generateToken: generateQrToken,
        persist: async ({ order, tickets }) => {
          const orderDoc = await payload.create({
            collection: 'orders',
            data: {
              code: order.code,
              channel: 'comp',
              // The ONE field that tells this comp from an admin's (#430,
              // stories 52 + 53): the cap counts it, /admin shows it.
              compIssuedBy: 'self',
              member: memberId,
              buyerName: order.buyerName,
              email: order.email,
              adultCount: order.adultCount,
              childCount: order.childCount,
              total: order.totalCents,
              refundStatus: 'none',
              show: order.showId,
              locale: order.locale,
            },
            overrideAccess: true,
          })
          for (const t of tickets) {
            await payload.create({
              collection: 'tickets',
              data: {
                token: t.token,
                type: t.type,
                status: 'active',
                order: Number(orderDoc.id),
              },
              overrideAccess: true,
            })
          }
          return { orderId: String(orderDoc.id) }
        },
      },
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
  const email = await sendOrderTicketEmail(
    payload as unknown as OrderEmailPayload,
    result.orderId,
  )

  return {
    ok: true,
    orderId: result.orderId,
    code: result.code,
    ticketCount: result.tickets.length,
    emailStatus: email.status,
  }
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
