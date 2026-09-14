import { can } from '@/lib/access/permissions'
import { loadDoorShow } from '@/lib/app/scan-data'
import { formatPerformanceDateLong } from '@/lib/app/strings'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import { AppShell } from '../AppShell'
import { openScreen } from '../gate'
import { ScanStation } from './ScanStation'

// `/app/scan` — Skener (#504), the door screen, in the system skin since #572.
//
// The camera, the four result states, Pusti ostatak grupe (n), Poništi
// propuštanje, Pronađi ulaznicu and the "ušlo X od Y" ring are all the
// behaviour that shipped with #504. What changed with the redesign is the
// clothes: the shared shapes, a ring twice the size, a count that moves when
// somebody walks in, and the manual search in a sheet rather than a block of
// form under the button.
//
// **The whole screen is dark whatever skin the reader chose**, and that is the
// one deliberate exception to T8's switch (#572, Q43). The door works after
// sunset, often at arm's length, and a white page is a lamp in the volunteer's
// face and a mirror in the guest's. It is the same night island #490 drew,
// said in the system's own words now: `data-theme="dark"` on the screen's own
// root, which re-points the SAME tokens the theme switch re-points, so
// everything inside it — cards, buttons, the sheet, the ring — follows without
// knowing it is on an island. The header and the tab bar stay in the reader's
// own theme: they belong to the app, not to the door.
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

  // The evening, formatted here rather than in the island: it is a server fact
  // and a Croatian month name, and neither belongs in the browser's bundle.
  const when =
    show &&
    `${formatPerformanceDateLong(show.date)} · ${show.time} · ${
      VENUE_LABEL.hr[show.venue as Venue] ?? show.venue
    }`

  return (
    <AppShell viewer={viewer} screen="scan">
      {/* The island, and nothing above it: the header and the tab bar belong to
          the app and keep the reader's own skin. `data-theme` is the very
          attribute the switch in Profil writes, read here one level down. */}
      <div className="app__scan" data-theme="dark">
        <ScanStation
          showId={show ? String(show.id) : null}
          canOpenOrder={canOpenOrder}
          when={when ?? null}
          progress={progress ? { admitted: progress.admitted, sold: progress.sold } : null}
        />
      </div>
    </AppShell>
  )
}
