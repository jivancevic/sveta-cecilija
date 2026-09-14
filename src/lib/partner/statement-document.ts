// **Obračun** — the document HGD sends a reseller at the end of a month (#599).
//
// The secretary described it in one sentence: "Excel tablica s prodajom po
// datumima i naznačenom ukupnom vrijednosti prodanog. Ukupno minus 10% = total
// koji mi njima fakturiramo." Everything here is that sentence, made precise.
//
// **One document, two renderers.** `reconciliation-csv.ts` and
// `render-statement-pdf.tsx` both take a `StatementDocument` and print it; they
// never compute. That is what makes the file the partner opens, the page the
// secretary reads and the PDF the accountant invoices against literally the
// same figures rather than three implementations that agree today.
//
// **Three rules the shape enforces, not three conventions to remember:**
//
//   1. *Storno is not a number on this statement.* `cancelled` is a line of its
//      own, in a field of its own, and it is never added to gross, commission
//      or net. An invoice is raised against `netCents`, so a void that leaked
//      into a sum would be money the partner is billed for twice.
//   2. *The period is a range of SALE days, and it says so.* A partner charged
//      their guest at the counter and closes their till by sale day, so that is
//      the only date on which both sides can reconcile cash — not the evening
//      the guest attends, which may be a month later (ADR-0008).
//   3. *There is no IBAN and no payment instruction.* The partner pays against
//      the račun the accountant issues; a payment line here would invite a
//      transfer outside that invoice and break the accountant's matching. The
//      closing sentence says who issues it instead.
//
// **Croatian only, on purpose.** Every current partner is a Croatian agency and
// the document passes through a Croatian secretary and a Croatian accountant.
// An English column head on a document somebody compares against their own book
// is friction with no reader. If GetYourGuide ever lands as a Partner this
// grows a locale; until then a second language is a second thing to keep
// correct for nobody.

import { VENUE_LABEL, type Venue } from '../venues'
import type { ReconStatement } from './partner-reconciliation'

/** The reseller, as the accountant needs them on an invoice. */
export interface StatementParty {
  name: string
  /** Croatian tax ID. Empty when the Partners row has none. */
  oib?: string | null
  billingAddress?: string | null
}

/** One izvedba the partner sold into, during the period. */
export interface StatementLine {
  showId: string
  /** "17. 7. 2026." */
  date: string
  /** "Ljetno kino". */
  venue: string
  adults: number
  children: number
  /** Billable pieces: adults + children. */
  tickets: number
  grossCents: number
}

/**
 * What the partner may NOT be billed for, and what they should tick off against
 * their own till. Never part of a sum on the document.
 */
export interface StatementCancelled {
  count: number
  cents: number
  stornoCount: number
  refundCount: number
}

export interface StatementTotals {
  adults: number
  children: number
  tickets: number
  /** *Vrijednost prodanog*: face value of everything billable in the period. */
  grossCents: number
  commissionCents: number
  /** *Za uplatu HGD-u*: gross minus the partner's commission. */
  netCents: number
}

export interface StatementDocument {
  partnerId: string
  partner: StatementParty
  year: number
  /** 1-12. */
  month: number
  /** `YYYY-MM-DD`, the first and last SALE day of the period. */
  periodFrom: string
  periodTo: string
  /** "1. 8. do 31. 8. 2026." */
  periodLabel: string
  /** "Kolovoz 2026." */
  monthLabel: string
  commissionPercent: number
  lines: StatementLine[]
  totals: StatementTotals
  cancelled: StatementCancelled
}

const MONTHS_HR = [
  'Siječanj',
  'Veljača',
  'Ožujak',
  'Travanj',
  'Svibanj',
  'Lipanj',
  'Srpanj',
  'Kolovoz',
  'Rujan',
  'Listopad',
  'Studeni',
  'Prosinac',
]

/** Days in a month; `Date.UTC(y, m, 0)` is the last day of month `m` (1-12). */
function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * "17. 7. 2026." from `YYYY-MM-DD`.
 *
 * Split rather than parsed: a calendar date is a string and never an instant,
 * and putting one through `Date` is how an evening in Zagreb becomes the
 * previous day (`pg_date_columns_gotcha`). A value that is not a calendar date
 * is handed back unchanged, so a malformed row shows something rather than
 * "NaN. NaN.".
 */
export function formatStatementDay(isoDate: string | null | undefined): string {
  const [year, month, day] = String(isoDate ?? '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!year || !month || !day) return String(isoDate ?? '')
  return `${day}. ${month}. ${year}.`
}

/** "Kolovoz 2026." — the period as a title. */
export function formatStatementMonth(year: number, month: number): string {
  return `${MONTHS_HR[month - 1] ?? month} ${year}.`
}

/**
 * "1. 8. do 31. 8. 2026." — the period, spelled as the SALE days it covers.
 *
 * The year appears once, at the end, because both ends are always in the same
 * month: a statement is one Europe/Zagreb month and cannot straddle a boundary.
 */
export function formatStatementPeriod(year: number, month: number): string {
  return `1. ${month}. do ${lastDayOf(year, month)}. ${month}. ${year}.`
}

/**
 * EUR cents for a CSV cell: "1234,56". Decimal COMMA, no thousands separator.
 *
 * The comma is what makes Croatian Excel read the cell as a number rather than
 * as text; leaving the thousands separator out is what stops a machine set to a
 * different locale reading "1.234,56" as something else entirely.
 */
export function amountForCsv(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${pad2(abs % 100)}`
}

/** EUR cents for a printed line: "1.234,56". Croatian grouping, for reading. */
export function amountForPrint(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${whole},${pad2(abs % 100)}`
}

/**
 * The reseller's name as a filename fragment: "kaleta", "aminess-hotels".
 *
 * Croatian letters are folded to their ASCII base rather than dropped, because
 * "Čanak" and "Canak" are the same agency and a file called `obracun--2026-08`
 * names nobody.
 */
export function partnerSlug(name: string): string {
  const folded = String(name ?? '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/đ/g, 'd')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'partner'
}

/** `obracun-kaleta-2026-08` — the base both downloads take their name from. */
export function statementFileBase(doc: StatementDocument): string {
  return `obracun-${partnerSlug(doc.partner.name)}-${doc.year}-${pad2(doc.month)}`
}

export interface BuildDocumentInput {
  statement: ReconStatement
  partner: StatementParty
}

/**
 * Turn a reconciliation into the document that gets sent.
 *
 * Nothing is recomputed here: every cent comes off the statement the route
 * already built. What this adds is the Croatian the reader needs and the two
 * facts the reconciliation has no opinion about — who the partner is, and which
 * days the period covers.
 */
export function buildStatementDocument(input: BuildDocumentInput): StatementDocument {
  const { statement, partner } = input
  const { year, month } = statement

  const lines: StatementLine[] = statement.shows.map((show) => ({
    showId: show.showId,
    date: formatStatementDay(show.showDate ?? show.showLabel),
    venue: VENUE_LABEL.hr[show.showVenue as Venue] ?? show.showVenue ?? '',
    adults: show.active.adults,
    children: show.active.children,
    tickets: show.activeCount,
    grossCents: show.grossCents,
  }))

  return {
    partnerId: statement.partnerId,
    partner,
    year,
    month,
    periodFrom: `${year}-${pad2(month)}-01`,
    periodTo: `${year}-${pad2(month)}-${pad2(lastDayOf(year, month))}`,
    periodLabel: formatStatementPeriod(year, month),
    monthLabel: formatStatementMonth(year, month),
    commissionPercent: statement.commissionPercent,
    lines,
    totals: {
      adults: statement.active.adults,
      children: statement.active.children,
      tickets: statement.totalActive,
      grossCents: statement.grossCents,
      commissionCents: statement.commissionCents,
      netCents: statement.netCents,
    },
    cancelled: {
      count: statement.cancelledCount,
      cents: statement.cancelledCents,
      stornoCount: statement.stornoCount,
      refundCount: statement.refundCount,
    },
  }
}

/**
 * Every word the document prints, in one object.
 *
 * Here rather than in `APP_STRINGS` because these are the words of a DOCUMENT
 * that leaves the building, not of a screen: they are read by an agency's
 * bookkeeper who has never opened Cecilija, and they must stay identical
 * between the PDF attached to an e-mail and the CSV attached beside it.
 * `APP_STRINGS.statement` keeps the screen's own labels and borrows from here
 * for the three figures that appear in both places.
 */
export const STATEMENT_DOC_COPY = {
  title: 'Obračun partnerske prodaje',
  org: 'HGD SVETA CECILIJA',
  orgFull: 'Hrvatsko glazbeno društvo Sv. Cecilija - Korčula',
  orgAddress: 'Knežev prolaz 1, 20260 Korčula',
  orgOib: 'OIB: 52537805408',
  partner: 'Partner',
  oib: 'OIB',
  address: 'Adresa',
  period: 'Razdoblje',
  /** The period is a range of SALE days and the document says so out loud. */
  periodValue: (label: string) => `prodaja ${label}`,
  commissionRate: 'Provizija partnera',
  colDate: 'Datum izvedbe',
  colVenue: 'Mjesto',
  colAdults: 'Odrasli',
  colChildren: 'Djeca',
  colTickets: 'Ulaznica',
  /**
   * The money column, spelled twice on purpose. A spreadsheet cell has no
   * context, so the CSV head has to carry the currency in words; the PDF's
   * column is narrow and every amount under it is already an amount, so it
   * carries the symbol instead and stays on one line. A column head that wraps
   * reads as two headers on a document somebody checks line by line.
   */
  colGross: 'Vrijednost (EUR)',
  colGrossShort: 'Vrijednost €',
  totalRow: 'UKUPNO',
  gross: 'Vrijednost prodanog',
  commission: (percent: number) => `Provizija ${percent}%`,
  net: 'Za uplatu HGD-u',
  cancelledLabel: 'Stornirano u razdoblju',
  cancelledValue: (count: number, amount: string) => `${count} kom., ${amount} EUR`,
  cancelledNote: 'Nije uključeno u iznose iznad.',
  empty: 'U ovom razdoblju nema prodaje.',
  closing: 'Na temelju ovog obračuna knjigovodstvo izdaje račun.',
} as const
