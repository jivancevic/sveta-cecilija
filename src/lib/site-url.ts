// Runtime origin for buyer-facing links baked into artifacts that leave the
// server — chiefly the QR codes in ticket PDFs/emails and the on-page buyer QR.
//
// These MUST reflect the DEPLOYMENT that issued them, not a hardcoded prod host.
// A partner slip generated on dev.moreska.eu whose QR pointed at moreska.eu
// scanned to INVALID: the token only exists in the staging DB, so the prod scan
// page (different DB) never finds it. Mirror the cron route's resolution
// (NEXT_PUBLIC_BASE_URL with a prod fallback) so each environment self-references.
//
// Distinct from `SITE_URL` in `src/lib/seo.ts`, which is intentionally the fixed
// prod canonical for robots/sitemap and must not vary by environment.
export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'https://moreska.eu').replace(/\/+$/, '')
}

export function scanUrl(token: string): string {
  return `${siteBaseUrl()}/scan/${encodeURIComponent(token)}`
}

// Absolute redirect target back to the scan page. Built against siteBaseUrl(),
// NOT `req.url`: behind Coolify/Traefik the request URL carries the internal
// bind host, so `new URL(path, req.url)` produced a 303 Location of
// http://0.0.0.0:3000/scan/... that the browser then followed to a dead host.
export function scanRedirectUrl(token: string, params: Record<string, string> = {}): URL {
  const url = new URL(`/scan/${encodeURIComponent(token)}`, siteBaseUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}
