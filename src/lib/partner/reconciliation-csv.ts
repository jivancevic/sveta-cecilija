// CSV serialization for a monthly reconciliation statement (#146). Pure: takes a
// ReconStatement and the partner name, returns a CSV string. One row per show
// plus a TOTAL row; a header block carries the partner, period, and commission
// rate so the downloaded file is self-describing for the partner's accountant.

import { centsToEur, type ReconStatement } from './partner-reconciliation'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// RFC-4180 quoting: wrap in double quotes and double any embedded quote, when
// the value contains a comma, quote, or newline.
function csvCell(value: string | number): string {
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(cells: (string | number)[]): string {
  return cells.map(csvCell).join(',')
}

export function reconciliationToCsv(statement: ReconStatement, partnerName: string): string {
  const monthName = MONTHS[statement.month - 1] ?? String(statement.month)
  const lines: string[] = []

  // Self-describing header block.
  lines.push(row(['Partner', partnerName]))
  lines.push(row(['Period', `${monthName} ${statement.year}`]))
  lines.push(row(['Commission rate', `${statement.commissionPercent}%`]))
  lines.push('')

  // Per-show table.
  lines.push(row(['Show', 'Adults', 'Children', 'Active tickets', 'Cancelled', 'Gross (EUR)']))
  for (const s of statement.shows) {
    lines.push(
      row([
        s.showLabel,
        s.active.adults,
        s.active.children,
        s.activeCount,
        s.cancelledCount,
        centsToEur(s.grossCents),
      ]),
    )
  }

  // Totals row.
  lines.push(
    row([
      'TOTAL',
      statement.active.adults,
      statement.active.children,
      statement.totalActive,
      statement.cancelledCount,
      centsToEur(statement.grossCents),
    ]),
  )
  lines.push('')

  // Settlement summary.
  lines.push(row(['Gross (EUR)', centsToEur(statement.grossCents)]))
  lines.push(row([`Commission ${statement.commissionPercent}% (EUR)`, centsToEur(statement.commissionCents)]))
  lines.push(row(['Net payable (EUR)', centsToEur(statement.netCents)]))
  lines.push(row(['Cancelled (storno)', statement.stornoCount]))
  lines.push(row(['Cancelled (refund)', statement.refundCount]))

  return lines.join('\n') + '\n'
}
