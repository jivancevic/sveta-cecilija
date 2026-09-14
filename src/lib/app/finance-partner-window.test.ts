import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { partnerReceivable, type PartnerTicketRow } from './finance-view'

// **The season figure and the twelve statements have to agree** (#599).
//
// They could not before. `seasonPartnerTickets` windowed on `shows.date` with
// `publicPerformanceSql`, while `monthPartnerTickets` windowed on
// `orders.created_at` in Europe/Zagreb with no `shows` join at all, so a
// December sale for a July evening landed in two different periods and the
// season card could never be the sum of the months the accountant invoiced.
//
// Two halves to the check, because the bug had two halves:
//
//   1. **The arithmetic**, over rows: splitting a season into months and adding
//      the statements back up returns the season. This is a property of the
//      reconciliation and holds for any partition of the rows.
//   2. **The SQL**, as a source scan. The equality above is only meaningful if
//      the two queries actually partition the same set — which is a fact about
//      two SQL strings, and exactly the thing a later edit would break quietly.
//      Modelled on `finance-no-pii.test.ts`.

const ROOT = path.resolve(__dirname, '../../..')
const LOADER = path.join(ROOT, 'src/lib/app/finance-data.ts')

const PARTNERS = [
  { id: '1', name: 'Kaleta', active: true, commissionPercent: 10 },
  { id: '2', name: 'Marco Polo', active: false, commissionPercent: 15 },
]

function ticket(over: Partial<PartnerTicketRow> = {}): PartnerTicketRow {
  return {
    partnerId: '1',
    partner: PARTNERS[0],
    type: 'adult',
    status: 'active',
    ...over,
  } as PartnerTicketRow
}

/** A season's worth of rows, deliberately lumpy across the twelve months. */
function seasonRows(): PartnerTicketRow[][] {
  const months: PartnerTicketRow[][] = []
  for (let m = 1; m <= 12; m += 1) {
    const rows: PartnerTicketRow[] = []
    for (let i = 0; i < m * 3; i += 1) rows.push(ticket({ type: i % 4 === 0 ? 'child' : 'adult' }))
    for (let i = 0; i < m; i += 1) {
      rows.push(ticket({ partnerId: '2', partner: PARTNERS[1], type: i % 3 === 0 ? 'child' : 'adult' }))
    }
    // A void in every other month: it must leave both sides equally.
    if (m % 2 === 0) rows.push(ticket({ status: 'cancelled' }))
    months.push(rows)
  }
  return months
}

describe('the season is the sum of its months', () => {
  it('adds up, receivable for receivable', () => {
    const months = seasonRows()
    const season = partnerReceivable(PARTNERS, months.flat())

    const summed = new Map<string, number>()
    for (const rows of months) {
      for (const row of partnerReceivable(PARTNERS, rows).rows) {
        summed.set(row.partnerId, (summed.get(row.partnerId) ?? 0) + row.netCents)
      }
    }

    for (const row of season.rows) {
      expect(summed.get(row.partnerId), `partner ${row.partnerName}`).toBe(row.netCents)
    }
  })

  it('adds up as one total, which is the figure on the season card', () => {
    const months = seasonRows()
    const season = partnerReceivable(PARTNERS, months.flat())
    const summed = months.reduce(
      (total, rows) => total + partnerReceivable(PARTNERS, rows).totalNetCents,
      0,
    )
    expect(summed).toBe(season.totalNetCents)
  })

  it('still adds up when a month sold nothing at all', () => {
    const months = [[ticket(), ticket()], [], [ticket({ type: 'child' })]]
    const season = partnerReceivable(PARTNERS, months.flat())
    const summed = months.reduce(
      (total, rows) => total + partnerReceivable(PARTNERS, rows).totalNetCents,
      0,
    )
    expect(summed).toBe(season.totalNetCents)
  })
})

describe('the two queries partition the same rows', () => {
  const loader = readFileSync(LOADER, 'utf8')

  /** The body of one `async function <name>(…) { … }`, comments included. */
  function queryOf(name: string): string {
    const start = loader.indexOf(`async function ${name}(`)
    expect(start, `${name} must exist`).toBeGreaterThan(-1)
    const open = loader.indexOf('const res = await query(', start)
    const end = loader.indexOf('return res.rows', open)
    return loader.slice(open, end)
  }

  const season = queryOf('seasonPartnerTickets')
  const month = queryOf('monthPartnerTickets')

  it('both window on the SALE date, in Europe/Zagreb', () => {
    for (const [label, sql] of [
      ['season', season],
      ['month', month],
    ] as const) {
      expect(sql, `${label} must bucket by sale date`).toContain(
        "o.created_at AT TIME ZONE 'Europe/Zagreb'",
      )
      // The old season window. Its absence is the fix.
      expect(sql, `${label} must not window on the performance date`).not.toMatch(/s\.date\s*>=/)
    }
  })

  it('neither joins shows, so neither can filter on what a show is', () => {
    for (const [label, sql] of [
      ['season', season],
      ['month', month],
    ] as const) {
      expect(sql, `${label} must not join shows`).not.toMatch(/JOIN\s+shows/i)
    }
  })

  // Deliberate, and the one line most likely to be "fixed" back: a receivable
  // is a DEBT. `createPartnerSale` already refuses a non-public evening
  // (`SHOW_NOT_PUBLIC`), so the only way a partner seat can sit on one is an
  // after-the-fact `isPublic` flip — and the partner still owes that money, so
  // filtering it out here would understate a real receivable.
  it('neither filters on the public predicate', () => {
    expect(season).not.toContain('publicPerformanceSql')
    expect(month).not.toContain('publicPerformanceSql')
  })

  it('both join partners, so a deactivated reseller still owes what it sold', () => {
    expect(season).toMatch(/JOIN\s+partners/i)
    expect(month).toMatch(/JOIN\s+partners/i)
  })
})
