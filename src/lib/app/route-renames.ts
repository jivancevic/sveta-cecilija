// The 308s that keep Cecilija's old Croatian paths alive (#481, #495).
//
// Every screen that existed before the shell was renamed to an English segment
// in one deploy, so every old path redirects to its new one. A 308 keeps the
// method and the query string, which is what makes `?token=` survive the move.
// A renamed PARAMETER needs more than that, and the two entries with a `has`
// below are where `?sezona=` is captured and handed over as `?season=`.
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
  /**
   * A Next `has` condition, used where the QUERY was renamed too: `?sezona=`
   * became `?season=`, and a redirect cannot rename a parameter without
   * capturing it. The capturing entry has to sit before the plain one, which
   * catches the same path with no year on it.
   */
  has?: { type: 'query'; key: string; value: string }[]
}

export const APP_ROUTE_RENAMES: AppRouteRename[] = [
  { source: '/app/instalacija', destination: '/app/install', keep: 'forever' },
  { source: '/app/prijava', destination: '/app/session', keep: 'forever' },

  { source: '/app/izvedba/:id', destination: '/app/performances/:id', keep: 'one-release' },

  // The season carried over: `/app/moje?sezona=2025` is a real bookmark, and
  // dropping the year would quietly show this season's numbers instead.
  // `?dio=` is NOT carried: its two values were renamed as well, and a
  // redirect cannot map a value, so a link into the second panel opens on the
  // first. One tap, rather than a wrong year.
  {
    source: '/app/moje',
    destination: '/app/leaderboard?season=:sezona',
    keep: 'one-release',
    has: [{ type: 'query', key: 'sezona', value: '(?<sezona>.*)' }],
  },
  { source: '/app/moje', destination: '/app/leaderboard', keep: 'one-release' },
  {
    source: '/app/statistika',
    destination: '/app/leaderboard?season=:sezona&part=all',
    keep: 'one-release',
    has: [{ type: 'query', key: 'sezona', value: '(?<sezona>.*)' }],
  },
  { source: '/app/statistika', destination: '/app/leaderboard?part=all', keep: 'one-release' },
  { source: '/app/vise', destination: '/app/more', keep: 'one-release' },
  { source: '/app/set-password', destination: '/app/account', keep: 'one-release' },
  { source: '/app/povezi', destination: '/app/account', keep: 'one-release' },
  { source: '/app/pozivnice', destination: '/app/invitations', keep: 'one-release' },
  { source: '/app/dobrodosli', destination: '/app/welcome', keep: 'one-release' },
]

/** The shape `next.config.ts` wants. Permanent (308) without exception. */
export function appRouteRedirects() {
  return APP_ROUTE_RENAMES.map(({ source, destination, has }) => ({
    source,
    destination,
    permanent: true as const,
    ...(has ? { has } : {}),
  }))
}
