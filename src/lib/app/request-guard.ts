// Who is allowed to POST to `/app`'s two write routes (#421 follow-up).
//
// `/api/app/login` and `/api/app/logout` are unauthenticated, cookie-setting
// POSTs, which is exactly the shape a cross-site form or `fetch` can aim at a
// signed-in browser. Payload's own admin REST endpoints sit behind its CSRF
// list; these two do not, so they carry the check themselves:
//
//   1. `Sec-Fetch-Site: cross-site` — the browser has already told us the
//      request came from another site. Refuse.
//   2. An `Origin` header that is not one of ours. A same-origin `fetch` sends
//      our own origin, a cross-site one sends the attacker's.
//   3. Neither header — curl, a server-to-server call, an old browser doing a
//      same-origin navigation. Allowed: absence is not evidence of an attack,
//      and rule 4 already blocks the classic form-post vector.
//   4. `Content-Type: application/json`. A cross-site HTML form can only send
//      form-urlencoded, multipart or text/plain; requiring JSON forces a
//      preflight that rule 1 and 2 then answer.
//
// Pure, so the table lives in request-guard.test.ts rather than in a browser.

/** The request headers the check reads, plus the origins this deployment owns. */
export interface AppRequestMeta {
  /** `Origin`, when the client sent one. */
  origin?: string | null
  /** `Sec-Fetch-Site`: `same-origin` | `same-site` | `none` | `cross-site`. */
  secFetchSite?: string | null
  /** `Content-Type`, charset and all. */
  contentType?: string | null
  /** Origins that count as ours: the configured base URL and the request's own. */
  allowedOrigins: readonly string[]
}

/** A refusal the caller turns into a response, or null when the request passes. */
export interface AppRequestRejection {
  status: number
  /** HTTP-level, never shown as-is: the routes answer with a Croatian string. */
  reason: 'cross-site' | 'content-type'
}

/** `https://moreska.eu/app` → `https://moreska.eu`; anything unparseable → null. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Reads the three headers off a real request; the base URL is passed in. */
export function appRequestMeta(req: Request, baseUrl?: string | null): AppRequestMeta {
  // Usually the same origin twice; two entries only when the deployment is
  // reached under a name other than its configured base URL.
  const allowed = [
    ...new Set(
      [originOf(baseUrl), originOf(req.url)].filter((o): o is string => o !== null),
    ),
  ]
  return {
    origin: req.headers.get('origin'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    contentType: req.headers.get('content-type'),
    allowedOrigins: allowed,
  }
}

/** Null when the request may proceed; a rejection otherwise. */
export function rejectAppRequest(meta: AppRequestMeta): AppRequestRejection | null {
  if (meta.secFetchSite && meta.secFetchSite.toLowerCase() === 'cross-site') {
    return { status: 403, reason: 'cross-site' }
  }

  const origin = originOf(meta.origin)
  if (meta.origin && (!origin || !meta.allowedOrigins.includes(origin))) {
    return { status: 403, reason: 'cross-site' }
  }

  const type = (meta.contentType ?? '').split(';')[0]!.trim().toLowerCase()
  if (type !== 'application/json') {
    return { status: 415, reason: 'content-type' }
  }

  return null
}
