import path from 'node:path'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import {
  STATEMENT_DOC_COPY as C,
  amountForPrint,
  type StatementDocument,
} from './statement-document'

// The Obračun as the PDF that actually gets sent (#599).
//
// The secretary asked for "excel tablica", and she gets one — but the artifact
// she ATTACHES is this. A CSV is a working file: it opens differently on every
// machine, carries no letterhead, and an agency's bookkeeper filing it has no
// way to tell a settlement from a scratch export. A PDF is the same document on
// every screen and in every inbox, which is what a figure somebody raises an
// invoice against has to be. The CSV ships alongside for the person who wants
// to sum a column.
//
// **A sibling of `src/lib/email/render-tickets-pdf.tsx`, not a refactor of it.**
// That renderer is monolithic and ticket-shaped (A5 halves, QR blocks, a
// guillotine line) and untangling it to share a header would put a ticket at
// risk for a statement's benefit. What is shared is what should be: the
// registered fonts, the logo file and the palette, all of them read from the
// same paths, so the two documents look like they come from the same society.
//
// **What is deliberately NOT on this page:**
//
//   - *An IBAN or any payment instruction.* The partner pays against the račun
//     the accountant issues; a bank line here would invite a transfer outside
//     that invoice and leave the accountant unable to match it. The closing
//     sentence names who issues the račun instead.
//   - *A "generated on" stamp.* A sent statement is frozen (`partner_statements`),
//     so the same month downloaded a year later must be the same document. A
//     date that moves with the download would make two copies of one settlement
//     disagree on the one thing a filing clerk uses to tell them apart.
//   - *Any buyer.* A partner sells at their own counter and HGD never learns
//     who sat in the seat; nothing here could name one, and nothing should.

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'email')
const LOGO_PATH = path.join(process.cwd(), 'assets', 'images', 'cecilija-logo.png')

let fontsRegistered = false
function registerFontsOnce() {
  if (fontsRegistered) return
  Font.register({
    family: 'BodoniModaSC',
    src: path.join(FONT_DIR, 'BodoniModaSC-Regular.ttf'),
  })
  Font.register({
    family: 'IBMPlexMono',
    fonts: [
      { src: path.join(FONT_DIR, 'IBMPlexMono-Regular.ttf') },
      { src: path.join(FONT_DIR, 'IBMPlexMono-Bold.ttf'), fontWeight: 700 },
    ],
  })
  Font.register({ family: 'Inter', src: path.join(FONT_DIR, 'Inter-Regular.ttf') })
  // Hyphenation off — it is what keeps "Moreška", agency names and the Croatian
  // labels from being broken across a line by an English hyphenation table.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

// The ticket PDF's palette, to the value (`render-tickets-pdf.tsx`).
const BG = '#F5F2EC'
const INK = '#1A140C'
const GOLD = '#B8881A'
const MUTED = '#6B5E45'
const GOLD_TINT = '#F0E6CC'
const RULE = '#DED6C4'

const styles = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Inter',
    fontSize: 10,
    paddingVertical: 44,
    paddingHorizontal: 48,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottom: `1pt solid ${GOLD}`,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  // Source is 4488×5669 (portrait, ratio ~0.792); 26×33 preserves it.
  logo: { width: 26, height: 33, marginRight: 10 },
  org: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 2, color: MUTED },
  headerRight: { alignItems: 'flex-end' },
  title: { fontFamily: 'BodoniModaSC', fontSize: 15, color: INK },
  titleMonth: { fontFamily: 'IBMPlexMono', fontSize: 9, letterSpacing: 1, color: MUTED, marginTop: 3 },

  parties: { flexDirection: 'row', marginTop: 18 },
  party: { flex: 1, paddingRight: 18 },
  partyLabel: {
    fontFamily: 'IBMPlexMono',
    fontSize: 7,
    letterSpacing: 1.5,
    color: MUTED,
    marginBottom: 4,
  },
  partyName: { fontSize: 11, marginBottom: 2 },
  partyLine: { fontSize: 9, color: MUTED, marginBottom: 1 },

  terms: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingVertical: 8,
    borderTop: `1pt solid ${RULE}`,
    borderBottom: `1pt solid ${RULE}`,
  },
  termLabel: { fontFamily: 'IBMPlexMono', fontSize: 7, letterSpacing: 1.5, color: MUTED },
  termValue: { fontSize: 10, marginTop: 3 },

  tableHead: {
    flexDirection: 'row',
    marginTop: 20,
    paddingBottom: 6,
    borderBottom: `1pt solid ${INK}`,
  },
  rowLine: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottom: `0.5pt solid ${RULE}`,
  },
  totalLine: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderTop: `1pt solid ${INK}`,
  },
  // Six columns. The two text columns take the room; the four numeric ones are
  // fixed and right-aligned so the digits stack.
  colDate: { width: '23%' },
  colVenue: { width: '28%' },
  colNum: { width: '11%', textAlign: 'right' },
  // Wide enough that "VRIJEDNOST (EUR)" sits on one line: a column head that
  // wraps reads as two headers on a document somebody is checking line by line.
  colMoney: { width: '16%', textAlign: 'right' },
  headText: { fontFamily: 'IBMPlexMono', fontSize: 7, letterSpacing: 1, color: MUTED },
  cell: { fontSize: 9 },
  cellNum: { fontSize: 9, fontFamily: 'IBMPlexMono' },
  totalText: { fontFamily: 'IBMPlexMono', fontSize: 9, fontWeight: 700 },

  empty: { fontSize: 9, color: MUTED, paddingVertical: 10 },

  settlement: { marginTop: 22, alignItems: 'flex-end' },
  settleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '58%',
    paddingVertical: 5,
  },
  settleNet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '58%',
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: GOLD_TINT,
  },
  settleLabel: { fontSize: 10, color: MUTED },
  settleValue: { fontSize: 10, fontFamily: 'IBMPlexMono' },
  settleNetLabel: { fontSize: 11 },
  settleNetValue: { fontSize: 12, fontFamily: 'IBMPlexMono', fontWeight: 700 },

  cancelled: {
    marginTop: 20,
    paddingTop: 10,
    borderTop: `0.5pt solid ${RULE}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelledText: { fontSize: 9, color: MUTED },
  cancelledNote: { fontSize: 8, color: MUTED, marginTop: 3, fontStyle: 'normal' },

  closing: { marginTop: 26, fontSize: 10 },
  footer: {
    marginTop: 'auto',
    paddingTop: 14,
    fontFamily: 'IBMPlexMono',
    fontSize: 7,
    letterSpacing: 1,
    color: MUTED,
  },
})

/** "270,00 €" — every money value on the page carries its currency. */
function eur(cents: number): string {
  return `${amountForPrint(cents)} €`
}

/** The two sides of the settlement, side by side, as an invoice states them. */
function Parties({ doc }: { doc: StatementDocument }) {
  return (
    <View style={styles.parties}>
      <View style={styles.party}>
        <Text style={styles.partyLabel}>IZDAJE</Text>
        <Text style={styles.partyName}>{C.orgFull}</Text>
        <Text style={styles.partyLine}>{C.orgAddress}</Text>
        <Text style={styles.partyLine}>{C.orgOib}</Text>
      </View>
      <View style={styles.party}>
        <Text style={styles.partyLabel}>{C.partner.toUpperCase()}</Text>
        <Text style={styles.partyName}>{doc.partner.name}</Text>
        {/* OIB and address are what the accountant raises the račun from, which
            is the whole reason the Partners collection carries them. A partner
            saved without one simply drops the line rather than printing an
            empty label the bookkeeper would read as missing data. */}
        {doc.partner.oib ? (
          <Text style={styles.partyLine}>
            {C.oib}: {doc.partner.oib}
          </Text>
        ) : null}
        {doc.partner.billingAddress
          ? doc.partner.billingAddress
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => (
                <Text key={i} style={styles.partyLine}>
                  {line}
                </Text>
              ))
          : null}
      </View>
    </View>
  )
}

function TableHead() {
  return (
    <View style={styles.tableHead} fixed>
      <Text style={[styles.colDate, styles.headText]}>{C.colDate.toUpperCase()}</Text>
      <Text style={[styles.colVenue, styles.headText]}>{C.colVenue.toUpperCase()}</Text>
      <Text style={[styles.colNum, styles.headText]}>{C.colAdults.toUpperCase()}</Text>
      <Text style={[styles.colNum, styles.headText]}>{C.colChildren.toUpperCase()}</Text>
      <Text style={[styles.colNum, styles.headText]}>{C.colTickets.toUpperCase()}</Text>
      <Text style={[styles.colMoney, styles.headText]}>{C.colGrossShort.toUpperCase()}</Text>
    </View>
  )
}

export interface RenderStatementPdfInput {
  doc: StatementDocument
}

/**
 * Render one month's Obračun to a PDF buffer.
 *
 * The input is the whole document and nothing else: no partner id to look up,
 * no clock, no database. That is what lets a FROZEN statement (the JSON stored
 * when the month was marked sent) render to the same bytes a year later.
 */
export async function renderStatementPdf(input: RenderStatementPdfInput): Promise<Buffer> {
  registerFontsOnce()
  const { doc } = input

  const document = (
    <Document
      title={`${C.title} - ${doc.partner.name} - ${doc.monthLabel}`}
      author="HGD Sveta Cecilija"
      subject={`${C.title}, ${doc.monthLabel}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <Image style={styles.logo} src={LOGO_PATH} />
            <Text style={styles.org}>{C.org}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>{C.title}</Text>
            <Text style={styles.titleMonth}>{doc.monthLabel}</Text>
          </View>
        </View>

        <Parties doc={doc} />

        {/* The period says "prodaja" out loud: a statement buckets by the day
            the partner took the guest's money, never by the evening the guest
            attends. It is the only date the two tills can be compared on. */}
        <View style={styles.terms}>
          <View>
            <Text style={styles.termLabel}>{C.period.toUpperCase()}</Text>
            <Text style={styles.termValue}>{C.periodValue(doc.periodLabel)}</Text>
          </View>
          <View>
            <Text style={styles.termLabel}>{C.commissionRate.toUpperCase()}</Text>
            <Text style={styles.termValue}>{doc.commissionPercent}%</Text>
          </View>
        </View>

        <TableHead />

        {doc.lines.length === 0 ? (
          <Text style={styles.empty}>{C.empty}</Text>
        ) : (
          doc.lines.map((line) => (
            <View key={line.showId} style={styles.rowLine} wrap={false}>
              <Text style={[styles.colDate, styles.cell]}>{line.date}</Text>
              <Text style={[styles.colVenue, styles.cell]}>{line.venue}</Text>
              <Text style={[styles.colNum, styles.cellNum]}>{line.adults}</Text>
              <Text style={[styles.colNum, styles.cellNum]}>{line.children}</Text>
              <Text style={[styles.colNum, styles.cellNum]}>{line.tickets}</Text>
              <Text style={[styles.colMoney, styles.cellNum]}>
                {amountForPrint(line.grossCents)}
              </Text>
            </View>
          ))
        )}

        <View style={styles.totalLine}>
          <Text style={[styles.colDate, styles.totalText]}>{C.totalRow}</Text>
          <Text style={[styles.colVenue, styles.totalText]}> </Text>
          <Text style={[styles.colNum, styles.totalText]}>{doc.totals.adults}</Text>
          <Text style={[styles.colNum, styles.totalText]}>{doc.totals.children}</Text>
          <Text style={[styles.colNum, styles.totalText]}>{doc.totals.tickets}</Text>
          <Text style={[styles.colMoney, styles.totalText]}>
            {amountForPrint(doc.totals.grossCents)}
          </Text>
        </View>

        {/* The secretary's own arithmetic, in her own words: ukupno minus 10%
            is the total HGD invoices. `Za uplatu HGD-u` is the only figure on
            the page a račun is raised from, so it is the only one with a fill
            behind it. */}
        <View style={styles.settlement}>
          <View style={styles.settleRow}>
            <Text style={styles.settleLabel}>{C.gross}</Text>
            <Text style={styles.settleValue}>{eur(doc.totals.grossCents)}</Text>
          </View>
          <View style={styles.settleRow}>
            <Text style={styles.settleLabel}>{C.commission(doc.commissionPercent)}</Text>
            <Text style={styles.settleValue}>− {eur(doc.totals.commissionCents)}</Text>
          </View>
          <View style={styles.settleNet}>
            <Text style={styles.settleNetLabel}>{C.net}</Text>
            <Text style={styles.settleNetValue}>{eur(doc.totals.netCents)}</Text>
          </View>
        </View>

        {/* Below the settlement and outside every sum. A storno is a seat the
            partner voided; it is on the page so they can tick it off against
            their own till, and it is never a deduction, because the račun is
            raised net and a void already left the gross. */}
        <View style={styles.cancelled}>
          <View>
            <Text style={styles.cancelledText}>
              {C.cancelledLabel}:{' '}
              {C.cancelledValue(doc.cancelled.count, amountForPrint(doc.cancelled.cents))}
            </Text>
            <Text style={styles.cancelledNote}>{C.cancelledNote}</Text>
          </View>
        </View>

        <Text style={styles.closing}>{C.closing}</Text>

        <Text style={styles.footer}>{C.orgFull.toUpperCase()}</Text>
      </Page>
    </Document>
  )

  return renderToBuffer(document)
}
