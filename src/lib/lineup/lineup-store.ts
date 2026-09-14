// The Payload half of the lineup row lock (#432, #442 review).
//
// `write-tx.ts` owns the ORDER (lock → re-check → write → commit); this file
// owns the four statements, and nothing else. The split is the usual one in
// this codebase: the rule is unit-tested over a fake, the SQL is exercised by
// the route in a browser and by the schema probe.
//
// Two things here are worth knowing before editing.
//
// **The lock has to run on the transaction's own connection.** A Payload
// transaction is a drizzle transaction the adapter parks in
// `payload.db.sessions[transactionID].db`; the pool connection `payload.db.pool`
// hands out is a DIFFERENT connection, and a `FOR UPDATE` taken there would
// lock nothing the transaction holds and would deadlock against it. So the raw
// statements go through the session's drizzle handle, which is the same object
// Payload's own operations use once you pass them `req: { transactionID }`.
//
// **The writes still go through the local API**, not through raw SQL, and they
// carry the same `transactionID`: `payload.create` on `lineups` keeps the
// collection's hooks and validation, and `payload.update` on `shows` is what
// makes the roster `afterChange` hook fire. (It looks at date, time, place,
// cancellation and the note, so a confirmation rings nobody — deliberate, and
// asserted in `shows-hook-lineup.test.ts`.)

import { sql } from '@payloadcms/db-postgres'
import { relationIdForWrite } from '@/lib/payload-relation'
import { isPerformanceKind, type PerformanceKind } from '@/lib/show-performance'
import { isDanceTitle, type TitleCounts } from './titles'
import type { LineupTxStore, LockedLineupState } from './write-tx'
import type { LineupEntry } from './rules'

/** The slice of `getPayload()` this store uses. */
export interface LineupStorePayload {
  db: {
    beginTransaction: () => Promise<string | null>
    commitTransaction: (id: string) => Promise<void>
    rollbackTransaction: (id: string) => Promise<void>
    sessions?: Record<string, { db?: { execute?: (query: unknown) => Promise<unknown> } }>
    drizzle?: { execute?: (query: unknown) => Promise<unknown> }
  }
  create: (args: Record<string, unknown>) => Promise<unknown>
  update: (args: Record<string, unknown>) => Promise<unknown>
  delete: (args: Record<string, unknown>) => Promise<unknown>
}

/** A Payload transaction id, or null on an adapter without transactions. */
export type PayloadTx = string | null

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/**
 * A timestamp column read through raw SQL → ISO, or null.
 *
 * node-postgres hands `timestamptz` back as a JS `Date` through most paths and
 * as its own text (`2026-09-08 18:23:14.643+02`) through this one, and a
 * re-confirm answering with that text instead of an ISO string is exactly the
 * `toIsoDate` trap `db-bootstrap.md` documents one type up. Normalised here, at
 * the only place that reads the column raw, so the route's contract is one
 * format whatever the driver felt like returning.
 */
function isoOf(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string' || value === '') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function createLineupStore(
  payload: LineupStorePayload,
  user?: unknown,
): LineupTxStore<PayloadTx> {
  /** The drizzle handle bound to this transaction, or the base one without. */
  const runner = (tx: PayloadTx) => {
    const session = tx ? payload.db.sessions?.[tx]?.db : undefined
    const handle = session ?? payload.db.drizzle
    if (!handle?.execute) {
      throw new Error('lineup store: no drizzle handle to run the row lock on')
    }
    return handle.execute.bind(handle)
  }

  /** `req` as the local API wants it, so every write joins the transaction. */
  const req = (tx: PayloadTx) => (tx ? ({ transactionID: tx } as never) : undefined)

  return {
    begin: () => payload.db.beginTransaction(),
    commit: async (tx) => {
      if (tx) await payload.db.commitTransaction(tx)
    },
    rollback: async (tx) => {
      if (tx) await payload.db.rollbackTransaction(tx)
    },

    lockPerformance: async (performanceId, tx): Promise<LockedLineupState | null> => {
      const execute = runner(tx)
      const id = Number(performanceId)
      if (!Number.isInteger(id)) return null

      // FOR UPDATE: the second writer of this evening blocks here until the
      // first commits, and then reads what it committed rather than what was
      // true when the request arrived.
      // `kind` rides along with the flag (#620): what a confirmed postava must
      // carry depends on it, and reading it outside the lock would be a second
      // opinion about the row being written.
      const locked = rowsOf(
        await execute(
          sql`SELECT lineup_confirmed, lineup_confirmed_at, kind FROM shows WHERE id = ${id} FOR UPDATE`,
        ),
      )
      if (locked.length === 0) return null

      // Counted inside the lock as well: "an empty postava may not be
      // confirmed" and "all four titles, once each" (#566) are both statements
      // about the moment of the write, so both are read off one grouped count
      // taken under the same lock rather than from a list loaded earlier.
      const counted = rowsOf(
        await execute(
          sql`SELECT role, count(*)::int AS n FROM lineups WHERE performance_id = ${id} GROUP BY role`,
        ),
      )

      let entryCount = 0
      let voditelji = 0
      const titles: TitleCounts = { crni_kralj: 0, otmanovic: 0, bili_kralj: 0, bula: 0 }
      for (const row of counted) {
        const n = Number(row.n ?? 0)
        entryCount += n
        if (isDanceTitle(row.role)) titles[row.role] += n
        if (row.role === 'voditelj') voditelji += n
      }

      // An unreadable kind falls back to `ostalo`, which is the strictest of the
      // two rules (the four titles): a row whose kind nobody can parse must not
      // become the one evening that confirms without them.
      const rawKind = locked[0].kind
      const kind: PerformanceKind = isPerformanceKind(rawKind) ? rawKind : 'ostalo'

      return {
        confirmed: locked[0].lineup_confirmed === true,
        confirmedAt: isoOf(locked[0].lineup_confirmed_at),
        kind,
        entryCount,
        voditelji,
        titles,
      }
    },

    deleteEntries: async (performanceId, tx) => {
      await payload.delete({
        collection: 'lineups',
        where: { performance: { equals: performanceId } },
        overrideAccess: true,
        req: req(tx),
      })
    },

    insertEntry: async (performanceId: string, entry: LineupEntry, tx) => {
      await payload.create({
        collection: 'lineups',
        data: {
          performance: relationIdForWrite(performanceId),
          member: relationIdForWrite(entry.memberId),
          role: entry.role,
        },
        overrideAccess: true,
        user,
        req: req(tx),
      })
    },

    setConfirmation: async (performanceId, confirmed, confirmedAt, tx) => {
      await payload.update({
        collection: 'shows',
        id: performanceId,
        data: { lineupConfirmed: confirmed, lineupConfirmedAt: confirmedAt },
        overrideAccess: true,
        user,
        req: req(tx),
      })
    },
  }
}
