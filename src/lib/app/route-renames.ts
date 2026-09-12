// The 308s that keep Cecilija's old Croatian paths alive (#481, #495).
//
// Every screen that existed before the shell was renamed to an English segment
// in one deploy, so every old path redirects to its new one. A 308 keeps the
// method and the query string, which is what makes `?token=` and `?sezona=`
// survive the move.
//
// **`keep` is the whole point of this module.** Two of these can never be
// dropped: the install guide is the target of a QR code that may hang on a
// rehearsal-room wall for years, and the sign-in link is inside SMS and mail
// that nobody can edit after sending. The rest follow the #481 rule — one
// release, dropped after the season — and `keep: 'one-release'` is what says
// which is which when somebody comes to clean up.

export interface AppRouteRename {
  source: string
  destination: string
  /** 'forever' = a link in the world points here and cannot be edited. */
  keep: 'forever' | 'one-release'
}

export const APP_ROUTE_RENAMES: AppRouteRename[] = [
  { source: '/app/instalacija', destination: '/app/install', keep: 'forever' },
  { source: '/app/prijava', destination: '/app/session', keep: 'forever' },

  { source: '/app/izvedba/:id', destination: '/app/performances/:id', keep: 'one-release' },
  { source: '/app/moje', destination: '/app/leaderboard', keep: 'one-release' },
  { source: '/app/statistika', destination: '/app/leaderboard?part=all', keep: 'one-release' },
  { source: '/app/vise', destination: '/app/more', keep: 'one-release' },
  { source: '/app/set-password', destination: '/app/account', keep: 'one-release' },
  { source: '/app/povezi', destination: '/app/account', keep: 'one-release' },
  { source: '/app/pozivnice', destination: '/app/invitations', keep: 'one-release' },
  { source: '/app/dobrodosli', destination: '/app/welcome', keep: 'one-release' },
]

/** The shape `next.config.ts` wants. Permanent (308) without exception. */
export function appRouteRedirects() {
  return APP_ROUTE_RENAMES.map(({ source, destination }) => ({
    source,
    destination,
    permanent: true as const,
  }))
}
