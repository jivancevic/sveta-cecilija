// The Payload wiring behind `createCompIssue`, in ONE place (#434 review).
//
// Two routes issue comps — `/api/comp/issue` (an admin, from the backoffice) and
// `/api/app/comp/issue` (a moreškant, for their own family) — and they issue the
// SAME thing: a `channel='comp'`, `total=0` order attributed to a Member, one
// ticket row per person, under the per-show sell lock. Before this file each
// route carried its own copy of the four deps, and the copies had already begun
// to drift (one normalised the show date, the other did not).
//
// So the deps live here and the routes pass only what actually differs:
//
//   - `memberId`     — who the comps are attributed to;
//   - `compIssuedBy` — 'admin' or 'self', the one field that tells them apart;
//   - `wrapLock`     — an optional extra step inside the seat lock, which is how
//                      `/app` gets its four-ticket cap counted next to the
//                      capacity check rather than before it.
//
// Everything else — the show read, the active-ticket count, the order code, the
// order + ticket writes — is identical by construction from now on.

import { randomInt } from 'crypto'
import { isPublicPerformance } from '@/lib/show-performance'
import { generateOrderCode as makeOrderCode } from '@/lib/tickets/order-code'
import { generateQrToken } from '@/lib/qr-token'
import { getActiveTicketCountForShow, type PoolQuery } from '@/lib/tickets/sold-seats'
import { withShowSellLock, type SellLockPool } from '@/lib/tickets/sell-lock'
import { toIsoDate } from '@/lib/to-iso-date'
import { VENUE_CAPACITY, type Venue } from '@/lib/venues'
import type { CompIssueDeps, CompIssueShow } from './create-comp-issue'

/** The slice of Payload's local API the comp deps use. */
export interface CompIssuePayload {
  find: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>
  findByID: (args: Record<string, unknown>) => Promise<unknown>
  create: (args: Record<string, unknown>) => Promise<{ id: string | number }>
  db: unknown
}

export type CompIssuedBy = 'admin' | 'self'

export interface CompIssueDepsOptions {
  /** The Member the comps are attributed to. Required: attribution is the point. */
  memberId: number
  /** Who issued them (#434). Always written explicitly, never left to a default. */
  compIssuedBy: CompIssuedBy
  /**
   * An extra check to run INSIDE the seat lock, before the engine's capacity
   * check and its inserts. `/app` uses it for the per-dancer cap; the admin
   * route passes nothing.
   */
  wrapLock?: () => Promise<void>
}

type CompPool = { query: PoolQuery } & SellLockPool

export function buildCompIssueDeps(
  payload: CompIssuePayload,
  options: CompIssueDepsOptions,
): CompIssueDeps {
  const pool = (payload.db as { pool: CompPool }).pool
  const { memberId, compIssuedBy, wrapLock } = options

  return {
    loadShow: async (id): Promise<CompIssueShow | null> => {
      const doc = (await payload
        .findByID({ collection: 'shows', id, depth: 0 })
        .catch(() => null)) as Record<string, unknown> | null
      if (!doc) return null
      return {
        id: Number(doc.id),
        // `toIsoDate`, never a raw cast: a raw pg read hands the column over as
        // a Date, and the upcoming-show guard compares date STRINGS.
        date: toIsoDate(doc.date),
        status: doc.status === 'cancelled' ? 'cancelled' : 'active',
        // ADR-0024: the ONE "is public" spelling lives in show-performance.
        isPublic: isPublicPerformance(doc),
        // Undefined for a non-public performance (it has no venue), which is
        // harmless: the pure flow rejects it before any seat maths runs.
        capacity: VENUE_CAPACITY[doc.venue as Venue],
        inPersonSold: (doc.inPersonSold as number) ?? 0,
        legacyReserved: (doc.legacyReserved as number) ?? 0,
      }
    },

    countActiveTickets: (id) =>
      getActiveTicketCountForShow((sql, params) => pool.query(sql, params), id),

    // The same per-show advisory lock partner sells use, so comps participate in
    // the shared oversell serialization. `wrapLock` runs inside it.
    withSeatLock: (showId, critical) =>
      withShowSellLock(pool, showId, async () => {
        if (wrapLock) await wrapLock()
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
          compIssuedBy,
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
      })
      // One row per person, sequential so serial ids stay in issuance order
      // (the PDF derives CODE-N from that order).
      for (const t of tickets) {
        await payload.create({
          collection: 'tickets',
          data: { token: t.token, type: t.type, status: 'active', order: Number(orderDoc.id) },
        })
      }
      return { orderId: String(orderDoc.id) }
    },
  }
}
