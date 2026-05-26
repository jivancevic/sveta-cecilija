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
    scanAtDoor: 'Scan this code at the door',
    doNotShare: 'Do not share this QR. One scan admits the entire party.',
    ticketsWord: (n: number) => (n === 1 ? 'ticket' : 'tickets'),
    adultsWord: (n: number) => (n === 1 ? 'adult' : 'adults'),
    childrenWord: (n: number) => (n === 1 ? 'child' : 'children'),
  },
  hr: {
    org: 'HGD SVETA CECILIJA',
    title: 'MOREŠKA',
    holder: 'Vlasnik',
    date: 'Datum',
    time: 'Vrijeme',
    venue: 'Mjesto',
    order: 'Narudžba',
    scanAtDoor: 'Skenirajte ovaj kod na ulazu',
    doNotShare: 'Ne dijelite QR kod. Jedno skeniranje pušta cijelu skupinu.',
    ticketsWord: (n: number) => {
      // hr: 1 = ulaznica, 2-4 = ulaznice, else ulaznica (gen.pl)
      if (n === 1) return 'ulaznica'
      if (n >= 2 && n <= 4) return 'ulaznice'
      return 'ulaznica'
    },
    adultsWord: (n: number) => (n === 1 ? 'odrasli' : 'odraslih'),
    childrenWord: (n: number) => (n === 1 ? 'dijete' : 'djece'),
  },
} as const

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

function ticketCountLabel(
  adults: number,
  children: number,
  c: (typeof COPY)['en'] | (typeof COPY)['hr'],
): string {
  const total = adults + children
  const head = `${total} ${c.ticketsWord(total)}`
  if (children === 0) return `${head}: ${adults} ${c.adultsWord(adults)}`
  if (adults === 0) return `${head}: ${children} ${c.childrenWord(children)}`
  return `${head}: ${adults} ${c.adultsWord(adults)}, ${children} ${c.childrenWord(children)}`
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Inter',
    fontSize: 11,
    padding: 48,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottom: `1pt solid ${GOLD}`,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    // Source is 4488×5669 (portrait, ratio ~0.792). 36×46 preserves it.
    width: 36,
    height: 46,
    marginRight: 12,
  },
  headerOrg: {
    fontFamily: 'IBMPlexMono',
    fontSize: 9,
    letterSpacing: 2,
    color: MUTED,
  },
  headerOrgRight: {
    fontFamily: 'IBMPlexMono',
    fontSize: 9,
    letterSpacing: 1,
    color: MUTED,
  },
  title: {
    fontFamily: 'BodoniModaSC',
    fontSize: 56,
    letterSpacing: 4,
    color: INK,
    marginTop: 30,
    textAlign: 'center',
  },
  showCard: {
    marginTop: 28,
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 4,
    borderTop: `0.5pt solid ${MUTED}`,
    borderBottom: `0.5pt solid ${MUTED}`,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: 'IBMPlexMono',
    fontSize: 9,
    letterSpacing: 1.5,
    color: MUTED,
    width: 80,
    paddingTop: 3,
  },
  fieldValue: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: INK,
    flex: 1,
  },
  fieldValueBig: {
    fontFamily: 'BodoniModaSC',
    fontSize: 16,
    letterSpacing: 1,
    color: INK,
    flex: 1,
  },
  qrWrap: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 14,
  },
  qr: {
    // ~80mm at 72dpi: 80mm = 226.77pt. Slight inset for white margin around the symbol.
    width: 227,
    height: 227,
  },
  ticketCount: {
    fontFamily: 'IBMPlexMono',
    fontSize: 12,
    letterSpacing: 1.5,
    color: INK,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  scanHint: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 6,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 14,
    borderTop: `0.5pt solid ${MUTED}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontFamily: 'IBMPlexMono',
    fontSize: 8,
    letterSpacing: 1,
    color: MUTED,
  },
})

export interface RenderTicketsPdfInput {
  buyer: { name: string }
  show: { date: string; time: string; venue: Venue }
  order: { adultCount: number; childCount: number }
  token: string
  locale: 'en' | 'hr'
  orderRef: string
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

  const qrPng = await deps.generateQrPng(`https://moreska.eu/scan/${input.token}`)

  const c = COPY[input.locale]
  const venueLabel = VENUE_LABEL[input.locale][input.show.venue]
  const dateLabel = formatDate(input.show.date, input.locale)
  const countLabel = ticketCountLabel(input.order.adultCount, input.order.childCount, c)

  const doc = (
    <Document
      title={`Moreška - ${input.show.date}`}
      author="HGD Sveta Cecilija"
      subject={`Tickets for ${input.show.date}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image style={styles.logo} src={LOGO_PATH} />
            <Text style={styles.headerOrg}>{c.org}</Text>
          </View>
          <Text style={styles.headerOrgRight}>
            {c.order} #{input.orderRef}
          </Text>
        </View>

        <Text style={styles.title}>{c.title}</Text>

        <View style={styles.showCard}>
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
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{c.holder.toUpperCase()}</Text>
            <Text style={styles.fieldValue}>{input.buyer.name}</Text>
          </View>
        </View>

        <View style={styles.qrWrap}>
          <Image style={styles.qr} src={pngDataUri(qrPng)} />
        </View>
        <Text style={styles.ticketCount}>{countLabel}</Text>
        <Text style={styles.scanHint}>{c.scanAtDoor}</Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{c.doNotShare}</Text>
          <Text style={styles.footerText}>moreska.eu</Text>
        </View>
      </Page>
    </Document>
  )

  return renderToBuffer(doc)
}

export const __test__ = { formatDate, ticketCountLabel, COPY, VENUE_LABEL }
