// The 308s left behind by a Backoffice screen that moved into Cecilija.
//
// The Backoffice (`/admin`) is being retired screen by screen (ADR-0027), and
// each port leaves an address people still have: on printed door instructions,
// in a browser's history, in the bookmark bar of the one person who opened that
// page every morning. So the old path redirects to the new one for a release,
// exactly as the app's own Croatian segments do in `app/route-renames.ts`.
//
// 308 (`permanent: true`) is the only correct code: it keeps the method and the
// query string, which is what makes a bookmarked `?season=` survive the move.
//
// ORDER MATTERS. A drill-down (`/admin/stats/:showId`) has to be listed before
// the list page it hangs under (`/admin/stats`), because Next matches redirects
// in order and the bare rule would otherwise never let the id through.
//
// These entries are dropped by #512, the ticket that removes the Backoffice
// views themselves — not before, and not one at a time.

export interface BackofficePort {
  source: string
  destination: string
  /** The Cecilija ticket that moved the screen, for whoever cleans up. */
  ticket: string
}

export const BACKOFFICE_PORTS: BackofficePort[] = [
  // The door scanner (#504). On printed instructions at the entrance, so it is
  // the one entry here with a paper trail behind it.
  { source: '/admin/scan', destination: '/app/scan', ticket: '#504' },

  // Statistika (#508). The per-show drill-down did not move to a statistics
  // page of its own: the evening's numbers now live on the evening itself
  // (#502), which is where the row in the new season table links to.
  {
    source: '/admin/stats/:showId',
    destination: '/app/performances/:showId',
    ticket: '#508',
  },
  { source: '/admin/stats', destination: '/app/stats', ticket: '#508' },
]

/** The shape `next.config.ts` wants. Permanent (308) without exception. */
export function backofficeRedirects() {
  return BACKOFFICE_PORTS.map(({ source, destination }) => ({
    source,
    destination,
    permanent: true as const,
  }))
}
