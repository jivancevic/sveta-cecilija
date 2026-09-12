// The join claim's device cookie (#463), the `onboarding.ts` shape.
//
// A dancer who has tapped their name at a rehearsal is waiting for a voditelj
// to say yes, and the browser has to be able to prove, when the answer comes,
// that it is the browser that asked. That proof is a random secret held in this
// cookie, and it is the credential that turns into a session — so:
//
//  - **`HttpOnly`**: no script on the page ever reads it, and nothing on the
//    public `/app/join/<kod>` page needs to. The routes read it off the header.
//  - **the database keeps only a SHA-256 of it** (`join-store.ts`), so a
//    readable backup is not a bundle of sign-ins.
//  - **`Path=/`**, unlike the onboarding cookie's `Path=/app`: it has to reach
//    both the page under `/app/join` and the routes under `/api/app/join`, and
//    a cookie cannot have two paths. It lives two hours and is cleared the
//    moment the claim is spent or refused.
//  - **`SameSite=Lax`**, so scanning the QR (a top-level navigation) carries it
//    and a third-party frame does not.

export const JOIN_COOKIE = 'moreskant_join'

/** True when the request reached us over https (Traefik terminates TLS). */
function secureRequest(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (proto) return proto === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

/** The `Set-Cookie` value that parks a claim secret on the dancer's device. */
export function joinClaimCookie(secret: string, maxAgeSeconds: number, req: Request): string {
  const parts = [
    `${JOIN_COOKIE}=${encodeURIComponent(secret)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.round(maxAgeSeconds)}`,
  ]
  if (secureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

/** The `Set-Cookie` value that takes it away again: spent, refused or expired. */
export function clearJoinClaimCookie(req: Request): string {
  const parts = [`${JOIN_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

/** The secret this request carries, if any. Parsed off the raw header. */
export function joinSecretFrom(req: Request): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === JOIN_COOKIE) {
      const value = rest.join('=')
      return value ? decodeURIComponent(value) : null
    }
  }
  return null
}
