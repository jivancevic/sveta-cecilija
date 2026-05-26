import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { render } from '@react-email/render'
import type { Venue } from '../venues'

const VENUE_LABEL: Record<'en' | 'hr', Record<Venue, string>> = {
  en: { 'ljetno-kino': 'Summer Cinema, Korčula', 'zimsko-kino': 'Cultural Center Korčula' },
  hr: { 'ljetno-kino': 'Ljetno kino, Korčula', 'zimsko-kino': 'Centar za kulturu, Korčula' },
}

const BG = '#F5F2EC'
const CARD = '#FFFFFF'
const INK = '#1A140C'
const GOLD = '#B8881A'
const MUTED = '#6B5E45'

const COPY = {
  en: {
    preview: (date: string) => `Your Moreška tickets - ${date}`,
    greeting: (name: string) => `Hi ${name},`,
    hero: 'Your Moreška ticket is attached.',
    heroSub:
      'Open the attached PDF and present the QR code at the door. One scan admits your entire party.',
    showHeading: 'Show details',
    date: 'Date',
    time: 'Time',
    venue: 'Venue',
    summaryHeading: 'Order summary',
    adultRow: (n: number) => `${n} × Adult ticket`,
    childRow: (n: number) => `${n} × Child ticket`,
    total: 'Total paid',
    orderRef: (ref: string) => `Order #${ref}`,
    refundNote:
      'Tickets are non-refundable by customer choice but 100% refundable if the show is cancelled by the organiser.',
    calendarHeading: 'Add to your calendar',
    calendarSub:
      'A calendar invite (.ics) is attached — most calendar apps add it with one tap. Or use the button:',
    addToGoogle: 'Add to Google Calendar',
    questions: 'Questions?',
    org: 'HGD Sveta Cecilija',
    address: 'Knežev prolaz 1, 20260 Korčula, Croatia',
    contact: 'info@moreska.eu',
  },
  hr: {
    preview: (date: string) => `Vaše ulaznice za morešku - ${date}`,
    greeting: (name: string) => `Poštovani ${name},`,
    hero: 'Vaša ulaznica za morešku priložena je uz ovaj e-mail.',
    heroSub:
      'Otvorite priloženi PDF i pokažite QR kod na ulazu. Jedno skeniranje pušta cijelu vašu skupinu.',
    showHeading: 'Detalji predstave',
    date: 'Datum',
    time: 'Vrijeme',
    venue: 'Mjesto',
    summaryHeading: 'Sažetak narudžbe',
    adultRow: (n: number) => `${n} × Odrasli`,
    childRow: (n: number) => `${n} × Dijete`,
    total: 'Ukupno plaćeno',
    orderRef: (ref: string) => `Narudžba #${ref}`,
    refundNote:
      'Povrat novca na zahtjev kupca nije moguć, no ulaznice su 100% povratne ako organizator otkaže predstavu.',
    calendarHeading: 'Dodajte u kalendar',
    calendarSub:
      'Pozivnica za kalendar (.ics) priložena je uz e-mail — većina aplikacija dodaje je u jednom dodiru. Ili koristite gumb:',
    addToGoogle: 'Dodaj u Google Calendar',
    questions: 'Imate pitanje?',
    org: 'HGD Sveta Cecilija',
    address: 'Knežev prolaz 1, 20260 Korčula, Hrvatska',
    contact: 'info@moreska.eu',
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

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full
}

const styles = {
  body: {
    backgroundColor: BG,
    color: INK,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    margin: 0,
    padding: '32px 0',
  } as const,
  container: {
    backgroundColor: CARD,
    margin: '0 auto',
    maxWidth: '560px',
    padding: '40px 36px',
    borderTop: `3px solid ${GOLD}`,
  } as const,
  brand: {
    fontFamily:
      "'Georgia', 'Times New Roman', serif",
    fontSize: '12px',
    letterSpacing: '3px',
    color: MUTED,
    margin: 0,
    textTransform: 'uppercase' as const,
  },
  goldRule: {
    border: 'none',
    borderTop: `1px solid ${GOLD}`,
    margin: '12px 0 28px',
  } as const,
  greeting: {
    fontSize: '15px',
    color: INK,
    margin: '0 0 12px',
  } as const,
  hero: {
    fontFamily:
      "'Georgia', 'Times New Roman', serif",
    fontSize: '24px',
    lineHeight: '1.3',
    color: INK,
    margin: '0 0 8px',
  } as const,
  heroSub: {
    fontSize: '14px',
    color: MUTED,
    lineHeight: '1.55',
    margin: '0 0 28px',
  } as const,
  card: {
    backgroundColor: BG,
    padding: '20px 22px',
    margin: '0 0 24px',
    borderLeft: `3px solid ${GOLD}`,
  } as const,
  cardEyebrow: {
    fontFamily: "'Courier New', monospace",
    fontSize: '10px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: GOLD,
    margin: '0 0 10px',
  } as const,
  showTitle: {
    fontFamily:
      "'Georgia', 'Times New Roman', serif",
    fontSize: '28px',
    letterSpacing: '2px',
    color: INK,
    margin: '0 0 16px',
    textTransform: 'uppercase' as const,
  } as const,
  showRow: {
    fontSize: '14px',
    color: INK,
    margin: '0 0 6px',
    lineHeight: '1.5',
  } as const,
  showRowLabel: {
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    letterSpacing: '1px',
    color: MUTED,
    textTransform: 'uppercase' as const,
    display: 'inline-block',
    width: '70px',
  } as const,
  sectionHeading: {
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    color: MUTED,
    margin: '0 0 12px',
  } as const,
  summaryTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    margin: '0 0 6px',
  } as const,
  summaryCellLeft: {
    fontSize: '14px',
    color: INK,
    padding: '3px 0',
    textAlign: 'left' as const,
  } as const,
  summaryCellRight: {
    fontSize: '14px',
    color: INK,
    padding: '3px 0',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
  } as const,
  totalRule: {
    border: 'none',
    borderTop: `1px solid ${MUTED}`,
    margin: '10px 0',
  } as const,
  totalRow: {
    fontSize: '16px',
    fontWeight: 700 as const,
    color: INK,
    margin: '4px 0 6px',
  } as const,
  orderRef: {
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    letterSpacing: '1px',
    color: MUTED,
    margin: '0 0 28px',
  } as const,
  refundNote: {
    fontSize: '12px',
    color: MUTED,
    fontStyle: 'italic' as const,
    lineHeight: '1.5',
    margin: '0 0 24px',
  } as const,
  calendarBlock: {
    margin: '0 0 24px',
  } as const,
  calendarSub: {
    fontSize: '13px',
    color: MUTED,
    lineHeight: '1.5',
    margin: '0 0 12px',
  } as const,
  calendarBtn: {
    display: 'inline-block',
    padding: '10px 18px',
    background: GOLD,
    color: '#fff',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.5px',
    borderRadius: '4px',
  } as const,
  footerHr: {
    border: 'none',
    borderTop: `1px solid ${BG}`,
    margin: '24px 0 16px',
  } as const,
  footerText: {
    fontSize: '11px',
    color: MUTED,
    lineHeight: '1.6',
    margin: 0,
  } as const,
}

export interface RenderTicketEmailInput {
  buyer: { name: string }
  show: { date: string; time: string; venue: Venue }
  order: { adultCount: number; childCount: number; total: number }
  locale: 'en' | 'hr'
  orderRef: string
  gcalUrl?: string
}

function TicketEmail(input: RenderTicketEmailInput) {
  const c = COPY[input.locale]
  const venueLabel = VENUE_LABEL[input.locale][input.show.venue]
  const dateLabel = formatDate(input.show.date, input.locale)
  const adultTotal = input.order.adultCount * 2000
  const childTotal = input.order.childCount * 1000

  return (
    <Html lang={input.locale}>
      <Head />
      <Preview>{c.preview(dateLabel)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{c.org}</Text>
          <Hr style={styles.goldRule} />

          <Text style={styles.greeting}>{c.greeting(firstName(input.buyer.name))}</Text>
          <Text style={styles.hero}>{c.hero}</Text>
          <Text style={styles.heroSub}>{c.heroSub}</Text>

          <Section style={styles.card}>
            <Text style={styles.cardEyebrow}>{c.showHeading}</Text>
            <Text style={styles.showTitle}>MOREŠKA</Text>
            <Text style={styles.showRow}>
              <span style={styles.showRowLabel}>{c.date}</span>
              {dateLabel}
            </Text>
            <Text style={styles.showRow}>
              <span style={styles.showRowLabel}>{c.time}</span>
              {input.show.time}
            </Text>
            <Text style={styles.showRow}>
              <span style={styles.showRowLabel}>{c.venue}</span>
              {venueLabel}
            </Text>
          </Section>

          <Text style={styles.sectionHeading}>{c.summaryHeading}</Text>
          <table style={styles.summaryTable} cellPadding={0} cellSpacing={0}>
            <tbody>
              {input.order.adultCount > 0 && (
                <tr>
                  <td style={styles.summaryCellLeft}>{c.adultRow(input.order.adultCount)}</td>
                  <td style={styles.summaryCellRight}>{formatEur(adultTotal)}</td>
                </tr>
              )}
              {input.order.childCount > 0 && (
                <tr>
                  <td style={styles.summaryCellLeft}>{c.childRow(input.order.childCount)}</td>
                  <td style={styles.summaryCellRight}>{formatEur(childTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <Hr style={styles.totalRule} />
          <Text style={styles.totalRow}>
            <span>{c.total}</span> <span style={{ float: 'right' }}>{formatEur(input.order.total)}</span>
          </Text>
          <Text style={styles.orderRef}>{c.orderRef(input.orderRef)}</Text>

          <Text style={styles.refundNote}>{c.refundNote}</Text>

          {input.gcalUrl && (
            <Section style={styles.calendarBlock}>
              <Text style={styles.sectionHeading}>{c.calendarHeading}</Text>
              <Text style={styles.calendarSub}>{c.calendarSub}</Text>
              <a href={input.gcalUrl} style={styles.calendarBtn}>
                {c.addToGoogle}
              </a>
            </Section>
          )}

          <Hr style={styles.footerHr} />
          <Text style={styles.footerText}>
            {c.questions} <a href={`mailto:${c.contact}`} style={{ color: GOLD }}>{c.contact}</a>
            <br />
            {c.org} · {c.address}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderTicketEmail(input: RenderTicketEmailInput): Promise<{
  html: string
  subject: string
}> {
  const c = COPY[input.locale]
  const dateLabel = formatDate(input.show.date, input.locale)
  const html = await render(<TicketEmail {...input} />)
  return { html, subject: c.preview(dateLabel) }
}

export const __test__ = { formatEur, formatDate, COPY, VENUE_LABEL }
