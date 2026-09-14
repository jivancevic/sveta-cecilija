// The Obračun as a spreadsheet (#146, rewritten in Croatian by #599).
//
// Pure: takes a `StatementDocument` and returns a CSV string. Every figure is
// already decided by `statement-document.ts`; nothing is computed here.
//
// **Three choices, and all three are about one machine: the secretary's Excel,
// set to Croatian.** The file it shipped with until #599 was comma-separated
// UTF-8 with no BOM and English headers, which that machine opens as a single
// column of mojibake — so the one artifact the whole settlement runs on had to
// be repaired by hand every month.
//
//   - **UTF-8 BOM.** Without it Excel guesses the system codepage and "Obračun"
//     arrives as "ObraÄun". The BOM is three bytes and it is the entire reason
//     Croatian text survives the trip.
//   - **Semicolon separator.** A locale whose decimal mark is the comma uses
//     the semicolon as its list separator, so a comma-separated file lands in
//     one column. This is also why there is no XLSX here and no spreadsheet
//     dependency in this project: a BOM and a semicolon solve it.
//   - **Decimal comma, no thousands separator** (`amountForCsv`), so an amount
//     arrives as a NUMBER that can be summed rather than as text.
//
// CRLF line endings for the same reason: it is what RFC-4180 says and what
// every Excel reads without a second thought.

import {
  STATEMENT_DOC_COPY as C,
  amountForCsv,
  type StatementDocument,
} from './statement-document'

/** The three bytes that tell Excel this file is UTF-8. */
const BOM = '﻿'
const SEP = ';'
const EOL = '\r\n'

// RFC-4180 quoting, against OUR separator: wrap in double quotes and double any
// embedded quote when the value carries a semicolon, a quote or a newline. A
// venue name with a comma in it needs no quoting here, which is half the point
// of the semicolon.
function cell(value: string | number): string {
  const s = String(value ?? '')
  if (s.includes(SEP) || /["\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(cells: (string | number)[]): string {
  return cells.map(cell).join(SEP)
}

export function statementToCsv(doc: StatementDocument): string {
  const lines: string[] = []

  // Who this is between, and for which days. The period spells out that it is
  // bucketed by SALE date, because that is the only thing both tills agree on.
  lines.push(row([C.title]))
  lines.push(row([C.partner, doc.partner.name]))
  if (doc.partner.oib) lines.push(row([C.oib, doc.partner.oib]))
  if (doc.partner.billingAddress) {
    // A textarea may hold newlines; a CSV cell reads better as one line.
    lines.push(row([C.address, doc.partner.billingAddress.replace(/\s*\n\s*/g, ', ')]))
  }
  lines.push(row([C.period, C.periodValue(doc.periodLabel)]))
  lines.push(row([C.commissionRate, `${doc.commissionPercent}%`]))
  lines.push('')

  // One row per izvedba, in calendar order, plus the TOTAL the invoice is
  // raised from.
  lines.push(
    row([C.colDate, C.colVenue, C.colAdults, C.colChildren, C.colTickets, C.colGross]),
  )
  for (const line of doc.lines) {
    lines.push(
      row([
        line.date,
        line.venue,
        line.adults,
        line.children,
        line.tickets,
        amountForCsv(line.grossCents),
      ]),
    )
  }
  if (doc.lines.length === 0) lines.push(row([C.empty]))
  lines.push(
    row([
      C.totalRow,
      '',
      doc.totals.adults,
      doc.totals.children,
      doc.totals.tickets,
      amountForCsv(doc.totals.grossCents),
    ]),
  )
  lines.push('')

  // The settlement itself: what was sold, what the partner keeps, what is owed.
  lines.push(row([C.gross, amountForCsv(doc.totals.grossCents)]))
  lines.push(row([C.commission(doc.commissionPercent), amountForCsv(doc.totals.commissionCents)]))
  lines.push(row([C.net, amountForCsv(doc.totals.netCents)]))

  // Storno sits BELOW the settlement and carries its own "not included" note,
  // so no reader can mistake it for a deduction. It is written even when it is
  // zero, because "nothing was cancelled" is itself a thing the partner checks.
  lines.push(
    row([C.cancelledLabel, C.cancelledValue(doc.cancelled.count, amountForCsv(doc.cancelled.cents))]),
  )
  lines.push(row([C.cancelledNote]))
  lines.push('')
  lines.push(row([C.closing]))

  return BOM + lines.join(EOL) + EOL
}
