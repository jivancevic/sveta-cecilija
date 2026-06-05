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
import type { Venue } from '../venues'
import { ADULT_PRICE_EUR, CHILD_PRICE_EUR } from '../pricing'
import { scanUrl } from '../site-url'

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
  Font.register({
    family: 'Inter',
    src: path.join(FONT_DIR, 'Inter-Regular.ttf'),
  })
  // Hyphenation off — keeps "Moreška", proper names, and short labels intact.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

const BG = '#F5F2EC'
const INK = '#1A140C'
const GOLD = '#B8881A'
const MUTED = '#6B5E45'
// Light fill derived from GOLD (#B8881A) for the partner claim note band.
const GOLD_TINT = '#F0E6CC'

// Mirrors VENUE_NAME in src/app/scan/[token]/page.tsx — admin slug → public name.
const VENUE_LABEL: Record<'en' | 'hr', Record<Venue, string>> = {
  en: { 'ljetno-kino': 'Summer Cinema, Korčula', 'zimsko-kino': 'Cultural Center Korčula' },
  hr: { 'ljetno-kino': 'Ljetno kino, Korčula', 'zimsko-kino': 'Centar za kulturu, Korčula' },
}

const COPY = {
  en: {
    org: 'HGD SVETA CECILIJA',
    title: 'MOREŠKA',
    holder: 'Holder',
    date: 'Date',
    time: 'Time',
    venue: 'Venue',
    order: 'Order',
    soldBy: 'Sold by',
    adult: 'Adult',
    child: 'Child',
    scanAtDoor: 'Scan this code at the door',
    perPerson: 'One ticket per person. This QR admits one person.',
    claimPrompt: 'Get a digital ticket and show updates. Scan this code and add your email.',
  },
  hr: {
    org: 'HGD SVETA CECILIJA',
    title: 'MOREŠKA',
    holder: 'Vlasnik',
    date: 'Datum',
    time: 'Vrijeme',
    venue: 'Mjesto',
    order: 'Narudžba',
    soldBy: 'Prodano putem',
    adult: 'Odrasli',
    child: 'Dijete',
    scanAtDoor: 'Skenirajte ovaj kod na ulazu',
    perPerson: 'Jedna ulaznica po osobi. Ovaj QR pušta jednu osobu.',
    claimPrompt:
      'Želite digitalnu ulaznicu i obavijesti o izvedbi? Skenirajte kod i upišite svoj email.',
  },
} as const

export type TicketType = 'adult' | 'child'

function formatDate(iso: string, locale: 'en' | 'hr'): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function priceEur(type: TicketType): number {
  return type === 'adult' ? ADULT_PRICE_EUR : CHILD_PRICE_EUR
}

/** "Adult · €20" / "Dijete · €10" — the per-ticket type + face price line. */
function typePriceLabel(type: TicketType, locale: 'en' | 'hr'): string {
  const c = COPY[locale]
  const word = type === 'adult' ? c.adult : c.child
  return `${word} · €${priceEur(type)}`
}

/**
 * The HOLDER row renders only when there is a buyer name. An unclaimed partner
 * slip carries an empty buyer name and shows SOLD BY instead of HOLDER.
 */
function showHolderRow(buyerName: string): boolean {
  return buyerName.trim().length > 0
}

/** Split tickets into pages of two (the 2-up A5 layout). */
function chunkPairs<T>(items: T[]): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += 2) pages.push(items.slice(i, i + 2))
  return pages
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Inter',
    fontSize: 11,
    flexDirection: 'column',
  },
  // Each ticket block is one A5 half of the A4 page. The dashed bottom border
  // on the top block is the guillotine cut line.
  block: {
    height: '50%',
    paddingVertical: 30,
    paddingHorizontal: 46,
    flexDirection: 'column',
  },
  blockTop: {
    borderBottom: `1pt dashed ${MUTED}`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottom: `1pt solid ${GOLD}`,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    // Source is 4488×5669 (portrait, ratio ~0.792). 28×35 preserves it.
    width: 28,
    height: 35,
    marginRight: 10,
  },
  headerOrg: {
    fontFamily: 'IBMPlexMono',
    fontSize: 8,
    letterSpacing: 2,
    color: MUTED,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  headerOrder: {
    fontFamily: 'IBMPlexMono',
    fontSize: 9,
    letterSpacing: 1,
    color: MUTED,
  },
  headerRef: {
    fontFamily: 'IBMPlexMono',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    color: INK,
    marginTop: 2,
  },
  body: {
    flexDirection: 'row',
    flex: 1,
    marginTop: 14,
  },
  details: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingRight: 16,
  },
  title: {
    fontFamily: 'BodoniModaSC',
    fontSize: 30,
    letterSpacing: 3,
    color: INK,
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  fieldLabel: {
    fontFamily: 'IBMPlexMono',
    fontSize: 8,
    letterSpacing: 1.5,
    color: MUTED,
    width: 56,
    paddingTop: 2,
  },
  fieldValue: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: INK,
    flex: 1,
  },
  fieldValueBig: {
    fontFamily: 'BodoniModaSC',
    fontSize: 13,
    letterSpacing: 0.5,
    color: INK,
    flex: 1,
  },
  typePrice: {
    fontFamily: 'IBMPlexMono',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    color: GOLD,
    marginTop: 10,
  },
  qrCol: {
    width: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    width: 140,
    height: 140,
  },
  scanHint: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 150,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  footerText: {
    fontFamily: 'IBMPlexMono',
    fontSize: 7,
    letterSpacing: 1,
    color: MUTED,
  },
  // Partner-slip claim invitation: a compact gold-tinted band between the body
  // and the footer. Kept short so the fixed 50%-height block never overflows.
  claimNote: {
    backgroundColor: GOLD_TINT,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  claimNoteText: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: INK,
  },
})

export interface RenderTicketsPdfTicket {
  token: string
  type: TicketType
  /** Human per-ticket reference, e.g. "AB23-1". */
  ref: string
}

export interface RenderTicketsPdfInput {
  buyer: { name: string }
  show: { date: string; time: string; venue: Venue }
  /** One entry per person (ADR-0007). */
  tickets: RenderTicketsPdfTicket[]
  locale: 'en' | 'hr'
  /** Order code shown in each block's header (e.g. "AB23"). */
  orderRef: string
  /** Present only on partner slips. Renders a SOLD BY detail row. */
  seller?: { name: string }
  /** Partner, unclaimed slips: render the claim-invitation note band. */
  showClaimPrompt?: boolean
}

export interface RenderTicketsPdfDeps {
  generateQrPng: (data: string) => Promise<Buffer>
}

function pngDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`
}

export async function renderTicketsPdf(
  input: RenderTicketsPdfInput,
  deps: RenderTicketsPdfDeps,
): Promise<Buffer> {
  registerFontsOnce()

  const c = COPY[input.locale]
  const venueLabel = VENUE_LABEL[input.locale][input.show.venue]
  const dateLabel = formatDate(input.show.date, input.locale)

  // One QR per ticket, rendered in issuance order. The scan URL must point at
  // the deployment that issued the slip (staging vs prod) — a hardcoded
  // moreska.eu made dev-issued partner slips scan to INVALID against the prod DB.
  const qrUris = await Promise.all(
    input.tickets.map(async (t) =>
      pngDataUri(await deps.generateQrPng(scanUrl(t.token))),
    ),
  )

  const blocks = input.tickets.map((t, i) => ({ ticket: t, qrUri: qrUris[i] }))
  const pages = chunkPairs(blocks)

  const renderBlock = (
    { ticket, qrUri }: { ticket: RenderTicketsPdfTicket; qrUri: string },
    isTop: boolean,
    key: number,
  ) => (
    <View key={key} style={isTop ? [styles.block, styles.blockTop] : styles.block}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image style={styles.logo} src={LOGO_PATH} />
          <Text style={styles.headerOrg}>{c.org}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.headerOrder}>
            {c.order} #{input.orderRef}
          </Text>
          <Text style={styles.headerRef}>{ticket.ref}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.details}>
          <Text style={styles.title}>{c.title}</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{c.date.toUpperCase()}</Text>
            <Text style={styles.fieldValueBig}>{dateLabel}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{c.time.toUpperCase()}</Text>
            <Text style={styles.fieldValueBig}>{input.show.time}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{c.venue.toUpperCase()}</Text>
            <Text style={styles.fieldValue}>{venueLabel}</Text>
          </View>
          {showHolderRow(input.buyer.name) && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{c.holder.toUpperCase()}</Text>
              {/* textOverflow keeps a very long name from growing the fixed-height
                  block; the block height is the real 2-up guarantee. */}
              <Text style={[styles.fieldValue, { textOverflow: 'ellipsis' }]}>
                {input.buyer.name}
              </Text>
            </View>
          )}
          {input.seller && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{c.soldBy.toUpperCase()}</Text>
              <Text style={[styles.fieldValue, { textOverflow: 'ellipsis' }]}>
                {input.seller.name}
              </Text>
            </View>
          )}
          <Text style={styles.typePrice}>{typePriceLabel(ticket.type, input.locale)}</Text>
        </View>

        <View style={styles.qrCol}>
          <Image style={styles.qr} src={qrUri} />
          <Text style={styles.scanHint}>{c.scanAtDoor}</Text>
        </View>
      </View>

      {input.showClaimPrompt && (
        <View style={styles.claimNote}>
          <Text style={styles.claimNoteText}>{c.claimPrompt}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{c.perPerson}</Text>
        <Text style={styles.footerText}>moreska.eu</Text>
      </View>
    </View>
  )

  const doc = (
    <Document
      title={`Moreška - ${input.show.date}`}
      author="HGD Sveta Cecilija"
      subject={`Tickets for ${input.show.date}`}
    >
      {pages.map((pair, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          {pair.map((block, i) => renderBlock(block, i === 0 && pair.length === 2, pageIdx * 2 + i))}
        </Page>
      ))}
    </Document>
  )

  return renderToBuffer(doc)
}

export const __test__ = {
  formatDate,
  typePriceLabel,
  chunkPairs,
  priceEur,
  COPY,
  VENUE_LABEL,
  showHolderRow,
}
