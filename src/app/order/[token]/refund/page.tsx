import { getPayload } from 'payload'
import config from '@payload-config'
import {
  resolveRescheduleRefund,
  type RefundContextPool,
  type RefundEligibility,
  type RefundOrderContext,
} from '@/lib/refund/reschedule-refund-context'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import RefundConfirm, { type RefundConfirmCopy } from './RefundConfirm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gold = '#b48a3c'
const ink = '#1a1a1a'
const cream = '#faf6ef'
const border = '#e6dfd1'
const bodyText = '#3d372f'
const muted = '#6b6257'

function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string, locale: 'en' | 'hr'): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(locale === 'hr' ? 'hr-HR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function venueLabel(venue: Venue, locale: 'en' | 'hr'): string {
  return VENUE_LABEL[locale][venue]
}

interface PageCopy {
  heading: string
  intro: string // reassurance-first: tickets moved, nothing to do
  escapeHatch: string // "can't make it? cancel + refund yourself"
  summaryTitle: string
  labelWhen: string
  labelWhere: string
  labelParty: string
  labelPaid: string
  ticketsWord: (n: number) => string
  confirm: RefundConfirmCopy
  // terminal / non-eligible states
  alreadyTitle: string
  alreadyBody: string
  scannedTitle: string
  scannedBody: string
  notOnlineTitle: string
  notOnlineBody: string
  invalidTitle: string
  invalidBody: string
}

function buildCopy(locale: 'en' | 'hr', n: number, amount: string): PageCopy {
  if (locale === 'hr') {
    return {
      heading: 'Vaše ulaznice',
      intro:
        'Termin ove izvedbe je promijenjen, a vaše ulaznice automatski vrijede za novi datum, ne morate ništa poduzimati.',
      escapeHatch:
        'Ako vam novi termin ne odgovara, ovdje možete sami otkazati ulaznice i zatražiti povrat novca, bez kontaktiranja nas.',
      summaryTitle: 'Vaša narudžba',
      labelWhen: 'Novi termin',
      labelWhere: 'Mjesto',
      labelParty: 'Ulaznice',
      labelPaid: 'Plaćeno',
      ticketsWord: (k) => `${k} ${k === 1 ? 'ulaznica' : k < 5 ? 'ulaznice' : 'ulaznica'}`,
      confirm: {
        cta: 'Otkaži ulaznice i zatraži povrat',
        confirmQuestion: `Ovime otkazujete svih ${n} ${
          n === 1 ? 'ulaznicu' : 'ulaznica'
        } i primate povrat od ${amount}. Radnja je konačna.`,
        confirmYes: 'Da, otkaži i vrati novac',
        cancel: 'Zadrži ulaznice',
        working: 'Obrađujemo vaš povrat…',
        successTitle: 'Povrat je obrađen',
        successBody: `Iznos od ${amount} vraćen je na vašu karticu. Može potrajati 5 do 10 dana da se prikaže.`,
        errorBody: 'Nešto je pošlo po zlu. Pokušajte ponovno za koji trenutak.',
      },
      alreadyTitle: 'Već ste zatražili povrat',
      alreadyBody: `Za ovu narudžbu je već izvršen povrat. Iznos od ${amount} vraćen je na vašu karticu.`,
      scannedTitle: 'Ove ulaznice su iskorištene',
      scannedBody:
        'Barem jedna ulaznica iz ove narudžbe već je skenirana na ulazu, pa povrat više nije moguć. Ako mislite da je ovo greška, javite nam se na info@moreska.eu.',
      notOnlineTitle: 'Nema što vratiti',
      notOnlineBody:
        'Ova narudžba nije plaćena online, pa nema uplate za povrat. Za pomoć nam se javite na info@moreska.eu.',
      invalidTitle: 'Poveznica nije važeća',
      invalidBody:
        'Ova poveznica za povrat nije važeća ili je istekla. Provjerite jeste li otvorili najnoviji e-mail o promjeni termina, ili nam se javite na info@moreska.eu.',
    }
  }
  return {
    heading: 'Your tickets',
    intro:
      "This performance has been moved to a new date, and your tickets are automatically valid for it, there's nothing you need to do.",
    escapeHatch:
      "If the new date doesn't work for you, you can cancel your tickets and get a refund yourself right here, no need to contact us.",
    summaryTitle: 'Your order',
    labelWhen: 'New date',
    labelWhere: 'Venue',
    labelParty: 'Tickets',
    labelPaid: 'Paid',
    ticketsWord: (k) => `${k} ticket${k === 1 ? '' : 's'}`,
    confirm: {
      cta: 'Cancel & refund my tickets',
      confirmQuestion: `This cancels all ${n} ticket${n === 1 ? '' : 's'} and refunds ${amount} to your card. This cannot be undone.`,
      confirmYes: 'Yes, cancel and refund',
      cancel: 'Keep my tickets',
      working: 'Processing your refund…',
      successTitle: 'Refund processed',
      successBody: `${amount} has been returned to your card. It may take 5 to 10 days to appear.`,
      errorBody: 'Something went wrong. Please try again in a moment.',
    },
    alreadyTitle: 'Already refunded',
    alreadyBody: `This order has already been refunded. ${amount} was returned to your card.`,
    scannedTitle: 'These tickets have been used',
    scannedBody:
      'At least one ticket on this order was already scanned at the door, so it can no longer be refunded. If you think this is a mistake, reach us at info@moreska.eu.',
    notOnlineTitle: 'Nothing to refund',
    notOnlineBody:
      'This order was not paid online, so there is no payment to refund. For help, reach us at info@moreska.eu.',
    invalidTitle: 'This link is not valid',
    invalidBody:
      "This refund link is not valid or has expired. Please check you opened the latest date-change email, or reach us at info@moreska.eu.",
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        background: cream,
        minHeight: '100vh',
        margin: 0,
        padding: '32px 16px',
        fontFamily: "Inter, -apple-system, 'Segoe UI', Arial, sans-serif",
        color: ink,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          border: `1px solid ${border}`,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 4, background: gold }} />
        <div style={{ padding: '30px 28px 34px' }}>{children}</div>
      </div>
    </main>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', lineHeight: 1.2, margin: '0 0 0.85rem' }}>
        {title}
      </h1>
      <p style={{ fontSize: '1rem', lineHeight: 1.6, color: bodyText, margin: 0 }}>{body}</p>
    </>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '7px 0' }}>
      <span style={{ color: muted, fontSize: '0.9rem' }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '0.95rem', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function EligibleView({ ctx, copy }: { ctx: RefundOrderContext; copy: PageCopy; }) {
  const { order, show } = ctx
  const n = order.adultCount + order.childCount
  const locale = order.locale
  return (
    <>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', lineHeight: 1.2, margin: '0 0 1rem' }}>
        {copy.heading}
      </h1>
      <p style={{ fontSize: '1rem', lineHeight: 1.6, color: bodyText, margin: '0 0 1.4rem' }}>{copy.intro}</p>

      <div style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '4px 0', margin: '0 0 1.4rem' }}>
        <SummaryRow label={copy.labelWhen} value={`${formatDate(show.date, locale)} · ${show.time}`} />
        <SummaryRow label={copy.labelWhere} value={`${venueLabel(show.venue, locale)}, Korčula`} />
        <SummaryRow label={copy.labelParty} value={copy.ticketsWord(n)} />
        <SummaryRow label={copy.labelPaid} value={euros(order.total)} />
      </div>

      <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: muted, margin: 0 }}>{copy.escapeHatch}</p>
    </>
  )
}

export default async function RefundPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const secret = process.env.PAYLOAD_SECRET ?? ''
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: RefundContextPool }).pool

  const { state, ctx } = await resolveRescheduleRefund(token, secret, pool)

  const locale: 'en' | 'hr' = ctx?.order.locale ?? 'en'
  const n = ctx ? ctx.order.adultCount + ctx.order.childCount : 0
  const amount = ctx ? euros(ctx.order.total) : ''
  const copy = buildCopy(locale, n, amount)

  const invalidNotice = { title: copy.invalidTitle, body: copy.invalidBody }
  const notices: Record<RefundEligibility, { title: string; body: string }> = {
    ALREADY_REFUNDED: { title: copy.alreadyTitle, body: copy.alreadyBody },
    SCANNED: { title: copy.scannedTitle, body: copy.scannedBody },
    NOT_ONLINE: { title: copy.notOnlineTitle, body: copy.notOnlineBody },
    // A token for a show that was never rescheduled has no self-serve right; show
    // the same neutral "not valid" notice rather than exposing the internal reason.
    NOT_RESCHEDULED: invalidNotice,
    INVALID: invalidNotice,
    // Never rendered (ELIGIBLE takes the other branch); defensive fallback only.
    ELIGIBLE: invalidNotice,
  }

  return (
    <Shell>
      {state === 'ELIGIBLE' && ctx ? (
        <>
          <EligibleView ctx={ctx} copy={copy} />
          <RefundConfirm token={token} copy={copy.confirm} />
        </>
      ) : (
        <Notice title={notices[state].title} body={notices[state].body} />
      )}
    </Shell>
  )
}
