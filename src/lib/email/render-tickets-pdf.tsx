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
    ticket: 'Ticket',
    adult: 'Adult',
    child: 'Child',
    order: 'Order',
    scanAtDoor: 'Scan this code at the door',
    doNotShare: 'Do not share this QR. Each code is single-use.',
    presentMobile: 'Present on phone or paper at the door.',
  },
  hr: {
    org: 'HGD SVETA CECILIJA',
    title: 'MOREŠKA',
    holder: 'Vlasnik',
    date: 'Datum',
    time: 'Vrijeme',
    venue: 'Mjesto',
    ticket: 'Ulaznica',
    adult: 'Odrasli',
    child: 'Dijete',
    order: 'Narudžba',
    scanAtDoor: 'Skenirajte ovaj kod na ulazu',
    doNotShare: 'Ne dijelite QR kod. Svaki kod vrijedi za jedan ulaz.',
    presentMobile: 'Pokažite na mobitelu ili papiru na ulazu.',
  },
} as const

function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

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

const styles = StyleSheet.create({
  page: {
    backgroundColor: BG,
    color: INK,
    fontFamily: 'Inter',
    fontSize: 11,
    padding: 36,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottom: `1pt solid ${GOLD}`,
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
  body: {
    flexDirection: 'row',
    flex: 1,
    marginTop: 28,
  },
  main: {
    flex: 1,
    paddingRight: 24,
  },
  stub: {
    width: 180,
    paddingLeft: 24,
    borderLeftWidth: 1,
    borderLeftStyle: 'dashed',
    borderLeftColor: MUTED,
    alignItems: 'center',
  },
  eyebrow: {
    fontFamily: 'IBMPlexMono',
    fontSize: 9,
    letterSpacing: 2,
    color: GOLD,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'BodoniModaSC',
    fontSize: 64,
    letterSpacing: 4,
    color: INK,
    marginBottom: 22,
  },
  subtitle: {
    fontFamily: 'IBMPlexMono',
    fontSize: 10,
    letterSpacing: 1,
    color: MUTED,
    marginBottom: 28,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: 'IBMPlexMono',
    fontSize: 8,
    letterSpacing: 1.5,
    color: MUTED,
    width: 70,
    paddingTop: 3,
  },
  fieldValue: {
    fontFamily: 'Inter',
    fontSize: 14,
    color: INK,
    flex: 1,
  },
  fieldValueBig: {
    fontFamily: 'BodoniModaSC',
    fontSize: 18,
    letterSpacing: 1,
    color: INK,
    flex: 1,
  },
  footer: {
    marginTop: 16,
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
  stubNumber: {
    fontFamily: 'BodoniModaSC',
    fontSize: 28,
    color: INK,
    marginBottom: 6,
  },
  stubType: {
    fontFamily: 'IBMPlexMono',
    fontSize: 10,
    letterSpacing: 2,
    color: GOLD,
    marginBottom: 14,
  },
  qr: {
    width: 140,
    height: 140,
    marginBottom: 12,
  },
  stubInstructions: {
    fontFamily: 'Inter',
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 1.4,
  },
  stubPrice: {
    fontFamily: 'BodoniModaSC',
    fontSize: 18,
    color: INK,
    marginTop: 12,
  },
})

export interface RenderTicketsPdfInput {
  buyer: { name: string }
  show: { date: string; time: string; venue: Venue }
  order: { adultCount: number; childCount: number }
  tokens: string[]
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

  const qrPngs = await Promise.all(
    input.tokens.map((t) => deps.generateQrPng(`https://moreska.eu/scan/${t}`)),
  )

  const c = COPY[input.locale]
  const venueLabel = VENUE_LABEL[input.locale][input.show.venue]
  const dateLabel = formatDate(input.show.date, input.locale)
  const total = input.tokens.length

  const doc = (
    <Document
      title={`Moreška - ${input.show.date}`}
      author="HGD Sveta Cecilija"
      subject={`Tickets for ${input.show.date}`}
    >
      {input.tokens.map((token, i) => {
        const isAdult = i < input.order.adultCount
        const typeLabel = isAdult ? c.adult : c.child
        const priceLabel = isAdult ? '€20' : '€10'
        return (
          <Page key={token} size="A4" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.headerOrg}>{c.org}</Text>
              <Text style={styles.headerOrgRight}>
                {c.order} #{input.orderRef}
              </Text>
            </View>

            <View style={styles.body}>
              <View style={styles.main}>
                <Text style={styles.eyebrow}>{input.locale === 'hr' ? 'ULAZNICA' : 'ADMIT ONE'}</Text>
                <Text style={styles.title}>{c.title}</Text>
                <Text style={styles.subtitle}>{dateLabel.toUpperCase()}</Text>

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

                <View style={styles.footer}>
                  <Text style={styles.footerText}>{c.doNotShare}</Text>
                  <Text style={styles.footerText}>moreska.eu</Text>
                </View>
              </View>

              <View style={styles.stub}>
                <Text style={styles.stubNumber}>
                  {i + 1} / {total}
                </Text>
                <Text style={styles.stubType}>{typeLabel.toUpperCase()}</Text>
                <Image style={styles.qr} src={pngDataUri(qrPngs[i])} />
                <Text style={styles.stubInstructions}>{c.scanAtDoor}</Text>
                <Text style={styles.stubPrice}>{priceLabel}</Text>
              </View>
            </View>
          </Page>
        )
      })}
    </Document>
  )

  return renderToBuffer(doc)
}

export const __test__ = { formatDate, formatEur, COPY, VENUE_LABEL }
