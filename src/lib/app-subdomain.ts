/**
 * `app.moreska.eu` is a vanity host for the staff app, not a second deployment:
 * one Coolify service, one container, one certificate set. The host is attached
 * to the prod app in Coolify purely so Traefik routes it and issues a cert; the
 * redirect itself lives here, in code, because Coolify regenerates its Traefik
 * labels whenever the domain list changes and a hand-written middleware label
 * would quietly disappear with it.
 *
 * These rules run as next.config `redirects()`, which Next evaluates before the
 * proxy (`src/proxy.ts`). That ordering matters: a request to the vanity host
 * never reaches the locale logic, so no `moreska_locale` cookie is ever set on
 * `app.moreska.eu`. Security headers are unaffected: `headers()` still matches
 * `/:path*` on every host.
 */
export const APP_SUBDOMAIN_HOST = 'app.moreska.eu'

const CANONICAL_APP_BASE = 'https://moreska.eu/app'

type HostRedirect = {
  source: string
  has: { type: 'host'; value: string }[]
  destination: string
  /**
   * An explicit 301, not `permanent: true` — that emits a 308, which a few old
   * QR scanners and link previewers still do not follow. The vanity host only
   * ever serves GET navigations, so there is no method to preserve.
   */
  statusCode: 301
}

/**
 * Order matters: the `/app/...` rule comes first so `app.moreska.eu/app/moje`
 * lands on `/app/moje` rather than `/app/app/moje`.
 */
export function appSubdomainRedirects(): HostRedirect[] {
  const has = [{ type: 'host' as const, value: APP_SUBDOMAIN_HOST }]
  return [
    { source: '/app/:path*', has, destination: `${CANONICAL_APP_BASE}/:path*`, statusCode: 301 },
    { source: '/:path*', has, destination: `${CANONICAL_APP_BASE}/:path*`, statusCode: 301 },
  ]
}
