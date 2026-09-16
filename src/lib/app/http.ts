// The two request details every `/app` cookie writer needs, spelled once.
//
// Both had grown a private copy in each file that wanted them — the
// `x-forwarded-proto` walk in four places and the `Cookie:` header parse in
// three — and neither is the sort of thing worth reading twice. They are pure
// enough to be table-tested (`http.test.ts`) and small enough that a copy is
// never obviously wrong, which is exactly how copies drift.

/** The first value of a possibly comma-folded header, trimmed; '' when absent. */
export function firstHeaderValue(req: Request, name: string): string {
  return req.headers.get(name)?.split(',')[0]?.trim() ?? ''
}

/**
 * Did the browser actually reach us over https?
 *
 * Traefik terminates TLS, so `req.url` behind the standalone server says
 * `http://0.0.0.0:3000/...` on a request the browser made over https; the
 * proxy's own `X-Forwarded-Proto` is the answer whenever it is present. The URL
 * is the fallback, which is what makes `http://localhost:3000` in development
 * get a cookie the browser keeps rather than a `Secure` one it drops.
 */
export function requestIsHttps(req: Request): boolean {
  const forwarded = firstHeaderValue(req, 'x-forwarded-proto')
  if (forwarded) return forwarded.toLowerCase() === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * One cookie's raw value out of a raw `Cookie:` header, or null.
 *
 * RAW: no `decodeURIComponent`, because the three callers disagree about it —
 * a device id and a session token are opaque and must not be touched, and the
 * join secret is percent-encoded and decoded by its own reader, which has to
 * treat a malformed escape as "no cookie" rather than as a 500. Splitting on
 * the FIRST `=` only, because a base64 value may carry more of them.
 */
export function cookieValue(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=')
    if (at === -1) continue
    if (pair.slice(0, at).trim() !== name) continue
    const value = pair.slice(at + 1).trim()
    return value === '' ? null : value
  }
  return null
}

/**
 * A `Date`, a number of milliseconds or nothing, as milliseconds or null.
 *
 * Shared by the two "is this old enough" rules (`shouldRenewSession`,
 * `shouldRecordDevice`), both of which take either shape because one reads a
 * JWT claim and the other a Postgres timestamp. `null` means "no usable
 * instant", which every caller treats as a refusal rather than as zero.
 */
export function toMillis(value: Date | number | null | undefined): number | null {
  if (value == null) return null
  const ms = value instanceof Date ? value.getTime() : value
  return Number.isFinite(ms) ? ms : null
}
