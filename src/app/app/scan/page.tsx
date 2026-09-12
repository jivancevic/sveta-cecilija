import { can } from '@/lib/access/permissions'
import { loadDoorShow } from '@/lib/app/scan-data'
import { APP_STRINGS, formatPerformanceDateLong } from '@/lib/app/strings'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { ScanStation } from './ScanStation'

// `/app/scan` — Skener (#504), the door screen.
//
// A port of `/admin/scan` and the door half of the old admin dashboard into the
// Cecilija shell, not a redesign: the camera, the four result states, Admit rest
// of party, Undo, the "Pronađi ulaznicu" fallback and the "ušlo X od Y" ring are
// all the behaviour that shipped, wearing the app's clothes.
//
// **The whole screen is a night island** (#490): the shell around it stays
// paper, and everything from the ring down re-points the tokens to the dark
// palette on `.app__night`. The door works in the dark and often at arm's
// length, and a white page is a lamp in the volunteer's face.
//
// The scanner itself is a full-screen overlay opened by the dominant button,
// which is the same number of taps the old flow cost (the dashboard's button
// was a link to `/admin/scan`) and makes the camera's auto-start MORE reliable,
// not less: the tap that opens the overlay is the user gesture iOS Safari wants
// before `getUserMedia`. Closing it comes straight back to the ring.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function ScanPage() {
  const { viewer, refusal } = await openScreen('scan')
  if (refusal) return refusal

  const { show, progress } = await loadDoorShow()
  // One link off the result card, for whoever may act on an order (#476). No
  // refund button on the scanner: a refund is an action inside an order.
  const canOpenOrder = can({ permissions: viewer.permissions }, 'refunds')

  return (
    <AppShell viewer={viewer} screen="scan">
      <div className="app__night app__scan">
        {show && progress ? (
          <section className="app__scan-ring" aria-live="polite">
            <p className="app__scan-when">
              {formatPerformanceDateLong(show.date)} · {show.time} ·{' '}
              {VENUE_LABEL.hr[show.venue as Venue] ?? show.venue}
            </p>
            <Ring admitted={progress.admitted} sold={progress.sold} percent={progress.percent} />
          </section>
        ) : (
          <section className="app__scan-ring app__scan-ring--empty">
            <p className="app__scan-none">{APP_STRINGS.scan.noShow}</p>
            <p className="app__scan-none-body">{APP_STRINGS.scan.noShowBody}</p>
          </section>
        )}

        <ScanStation showId={show ? String(show.id) : null} canOpenOrder={canOpenOrder} />
      </div>
    </AppShell>
  )
}

/**
 * The one number that matters at the door: admitted / sold, as a ring.
 *
 * Server-rendered SVG — the count changes when the page is reloaded, which is
 * what the volunteer does between rushes, and a poller on a phone at the gate
 * is battery nobody asked to spend.
 */
function Ring({ admitted, sold, percent }: { admitted: number; sold: number; percent: number }) {
  const size = 188
  const stroke = 14
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (percent / 100) * circ

  return (
    <svg
      className="app__scan-ringsvg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${admitted} ${APP_STRINGS.scan.of} ${sold} ${APP_STRINGS.scan.admitted}`}
    >
      <circle className="app__scan-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle
        className="app__scan-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="app__scan-count" x="50%" y="48%" textAnchor="middle">
        {admitted}
      </text>
      <text className="app__scan-total" x="50%" y="66%" textAnchor="middle">
        {APP_STRINGS.scan.of} {sold} {APP_STRINGS.scan.admitted}
      </text>
    </svg>
  )
}
