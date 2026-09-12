import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import { appSubdomainRedirects } from './src/lib/app-subdomain'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // camera=(self): the /admin/scan door scanner needs getUserMedia. `()` (empty
  // allowlist) disables the camera even same-origin — Chrome enforces this and
  // rejects getUserMedia ("Camera unavailable"); iOS Safari historically
  // ignored it, which masked the bug. (self) is the tightest value that still
  // lets our own origin open the camera; third-party iframes stay blocked, and
  // mic/geolocation remain fully disabled.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
]

// Staging (dev.moreska.eu) emits a blanket noindex on every response so search
// engines cannot index it even if a URL leaks. Read at build/start time;
// NEXT_PUBLIC_ENV is 'staging' only on the dev Coolify app (unset in prod).
const stagingHeaders =
  process.env.NEXT_PUBLIC_ENV === 'staging'
    ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
    : []

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [...securityHeaders, ...stagingHeaders] }]
  },
  async redirects() {
    return [
      // Host-scoped first (#479): these carry a `has` host condition, so they
      // only ever match `app.moreska.eu` and must be given the chance to match
      // before the host-agnostic rules below.
      ...appSubdomainRedirects(),
      // #481: URL path segments are English. These three API routes were renamed
      // (`storno` → `cancel`, `move-to-zimsko` → `move-to-indoor`); a 308 keeps
      // any still-deployed client working for one release. 308 (permanent: true)
      // is the only correct code here — it preserves the POST method and body,
      // unlike the 301 the vanity-host rules use, which only ever see GETs.
      // Drop these once the season is over and nothing calls the old paths.
      { source: '/api/partner/storno', destination: '/api/partner/cancel', permanent: true },
      { source: '/api/partner/storno/undo', destination: '/api/partner/cancel/undo', permanent: true },
      {
        source: '/api/shows/:id/move-to-zimsko',
        destination: '/api/shows/:id/move-to-indoor',
        permanent: true,
      },

      // ── Cecilija's Croatian segments (#473, #495) ──────────────────────
      //
      // The app's screens were renamed to English paths in one deploy, so
      // every old path 308s to its new one. A 308 keeps the method and the
      // query string, which is what makes `?token=` and `?sezona=` survive.
      //
      // TWO OF THEM ARE PERMANENT and must never be dropped: the install
      // guide is the target of a QR code that may hang on a wall for years,
      // and the sign-in link is in SMS and mail that nobody can edit after
      // sending. The rest follow the #481 rule — one release, dropped after
      // the season.
      { source: '/app/instalacija', destination: '/app/install', permanent: true },
      { source: '/app/prijava', destination: '/app/session', permanent: true },

      // One release only. Drop this block after the 2026 season.
      { source: '/app/izvedba/:id', destination: '/app/performances/:id', permanent: true },
      { source: '/app/moje', destination: '/app/leaderboard', permanent: true },
      { source: '/app/statistika', destination: '/app/leaderboard?part=all', permanent: true },
      { source: '/app/vise', destination: '/app/more', permanent: true },
      { source: '/app/set-password', destination: '/app/account', permanent: true },
      { source: '/app/povezi', destination: '/app/account', permanent: true },
      { source: '/app/pozivnice', destination: '/app/invitations', permanent: true },
      { source: '/app/dobrodosli', destination: '/app/welcome', permanent: true },
    ]
  },
}

export default withPayload(nextConfig)
