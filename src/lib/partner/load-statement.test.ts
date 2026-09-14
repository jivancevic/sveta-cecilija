import { describe, expect, it } from 'vitest'
import type { PoolQuery } from '@/lib/db/pool-query'
import type { PartnerRecord } from '@/lib/app/partner-screen'
import { freezePartnerStatement, loadPartnerStatement } from './load-statement'
import type { StatementDocument } from './statement-document'
import type { SentStamp, SentStatement, StatementStore } from './statement-store'

// **The defect this file closes** (#599): `commissionPercent` lives on the
// Partner and was applied at READ time, so raising a reseller's rate silently
// rewrote every month the accountant had already invoiced. Nothing was stored
// and no test covered it.
//
// The fix is that marking a month sent stores the document, and every later
// read of that month serves the stored one. These tests are about that
// property and nothing else, so the store is an in-memory fake and the pool is
// a stub that returns the rows a month should have.

/** The pool, answering only the reconciliation query, with rows we choose. */
function poolWith(ticketCount: number): PoolQuery {
  const rows = Array.from({ length: ticketCount }, () => ({
    show_id: 1,
    show_date: '2026-08-17',
    show_venue: 'ljetno-kino',
    type: 'adult',
    status: 'active',
    cancel_reason: null,
    order_created_at: '2026-08-02T10:00:00.000Z',
  }))
  return async () => ({ rows, rowCount: rows.length })
}

/** The table, in memory: the same DO NOTHING semantics as the real upsert. */
function fakeStore(): StatementStore & { rows: Map<string, SentStatement> } {
  const rows = new Map<string, SentStatement>()
  const key = (p: number, y: number, m: number) => `${p}-${y}-${m}`
  return {
    rows,
    async find(p, y, m) {
      return rows.get(key(p, y, m)) ?? null
    },
    async stampsIn(p, y): Promise<SentStamp[]> {
      return [...rows.values()]
        .filter((r) => Number(r.partnerId) === p && r.year === y)
        .map((r) => ({ year: r.year, month: r.month, sentAt: r.sentAt }))
    },
    async markSent({ partnerId, year, month, document, commissionPercent, sentBy }) {
      const k = key(partnerId, year, month)
      // ON CONFLICT DO NOTHING: a second stamp keeps the FIRST document.
      if (rows.has(k)) return
      rows.set(k, {
        partnerId: String(partnerId),
        year,
        month,
        document,
        commissionPercent,
        sentAt: '2026-09-03T08:00:00.000Z',
        sentBy: sentBy == null ? null : String(sentBy),
      })
    },
    async clearSent(p, y, m) {
      rows.delete(key(p, y, m))
    },
  }
}

function partner(over: Partial<PartnerRecord> = {}): PartnerRecord {
  return {
    id: '4',
    name: 'Kaleta',
    active: true,
    commissionPercent: 10,
    oib: '12345678901',
    billingAddress: 'Trg 1',
    ...over,
  }
}

const AUGUST = { year: 2026, month: 8 }

describe('a live month', () => {
  it('is computed from the rows as they are, and says it is not sent', async () => {
    const { document, sent } = await loadPartnerStatement(poolWith(3), {
      partner: partner(),
      ...AUGUST,
      store: fakeStore(),
    })
    expect(sent).toBeNull()
    expect(document.totals.grossCents).toBe(6000)
    expect(document.totals.netCents).toBe(5400)
  })

  it('moves when the commission moves, which is right while it is still live', async () => {
    const store = fakeStore()
    const at10 = await loadPartnerStatement(poolWith(3), { partner: partner(), ...AUGUST, store })
    const at20 = await loadPartnerStatement(poolWith(3), {
      partner: partner({ commissionPercent: 20 }),
      ...AUGUST,
      store,
    })
    expect(at10.document.totals.netCents).toBe(5400)
    expect(at20.document.totals.netCents).toBe(4800)
  })
})

describe('a month that has been marked sent', () => {
  it('does NOT move when the commission changes afterwards', async () => {
    const store = fakeStore()
    const pool = poolWith(3)

    const frozen = await freezePartnerStatement(pool, {
      partner: partner(),
      ...AUGUST,
      sentBy: 7,
      store,
    })
    expect(frozen.totals.netCents).toBe(5400)

    // The society renegotiates: Kaleta goes from 10% to 20%.
    const after = await loadPartnerStatement(pool, {
      partner: partner({ commissionPercent: 20 }),
      ...AUGUST,
      store,
    })

    expect(after.document.commissionPercent).toBe(10)
    expect(after.document.totals.commissionCents).toBe(600)
    expect(after.document.totals.netCents).toBe(5400)
    expect(after.sent).toEqual({ at: '2026-09-03T08:00:00.000Z', by: '7' })
  })

  it('does NOT move when later sales land, or a seat is voided', async () => {
    const store = fakeStore()
    await freezePartnerStatement(poolWith(3), { partner: partner(), ...AUGUST, sentBy: 7, store })

    // The same month re-read against a pool that now reports twice the rows.
    const after = await loadPartnerStatement(poolWith(6), { partner: partner(), ...AUGUST, store })
    expect(after.document.totals.grossCents).toBe(6000)
  })

  it('keeps the partner as they stood, because the račun was raised from it', async () => {
    const store = fakeStore()
    await freezePartnerStatement(poolWith(1), { partner: partner(), ...AUGUST, sentBy: 7, store })

    const renamed = await loadPartnerStatement(poolWith(1), {
      partner: partner({ name: 'Kaleta Travel d.o.o.', oib: '99999999999' }),
      ...AUGUST,
      store,
    })
    expect(renamed.document.partner).toEqual({
      name: 'Kaleta',
      oib: '12345678901',
      billingAddress: 'Trg 1',
    })
  })

  it('stores the rate beside the document, and the two agree', async () => {
    const store = fakeStore()
    await freezePartnerStatement(poolWith(2), {
      partner: partner({ commissionPercent: 15 }),
      ...AUGUST,
      sentBy: null,
      store,
    })
    const stored = await store.find(4, 2026, 8)
    expect(stored?.commissionPercent).toBe(15)
    expect(stored?.document.commissionPercent).toBe(15)
  })

  it('is not rewritten by a second stamp, which is how a retry stays harmless', async () => {
    const store = fakeStore()
    await freezePartnerStatement(poolWith(3), { partner: partner(), ...AUGUST, sentBy: 7, store })
    await freezePartnerStatement(poolWith(9), {
      partner: partner({ commissionPercent: 20 }),
      ...AUGUST,
      sentBy: 7,
      store,
    })
    const after = await loadPartnerStatement(poolWith(9), { partner: partner(), ...AUGUST, store })
    expect(after.document.totals.grossCents).toBe(6000)
    expect(after.document.commissionPercent).toBe(10)
  })
})

describe('un-marking', () => {
  it('returns the month to live, so the next stamp recomputes it', async () => {
    const store = fakeStore()
    await freezePartnerStatement(poolWith(3), { partner: partner(), ...AUGUST, sentBy: 7, store })
    await store.clearSent(4, 2026, 8)

    const after = await loadPartnerStatement(poolWith(6), {
      partner: partner({ commissionPercent: 20 }),
      ...AUGUST,
      store,
    })
    expect(after.sent).toBeNull()
    expect(after.document.totals.grossCents).toBe(12000)
    expect(after.document.commissionPercent).toBe(20)
  })
})

describe('what is frozen', () => {
  it('is the whole document, not a handful of totals', async () => {
    const store = fakeStore()
    const doc: StatementDocument = await freezePartnerStatement(poolWith(2), {
      partner: partner(),
      ...AUGUST,
      sentBy: 7,
      store,
    })
    expect(doc.lines).toHaveLength(1)
    expect(doc.periodLabel).toBe('1. 8. do 31. 8. 2026.')
    expect((await store.find(4, 2026, 8))?.document).toEqual(doc)
  })
})
