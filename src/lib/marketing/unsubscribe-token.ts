import { createHmac, timingSafeEqual } from 'crypto'

// Stateless one-click-unsubscribe tokens.
//
// The token carries the buyer's email plus an HMAC signature, so the
// /api/unsubscribe route can verify the request came from a mail we sent
// WITHOUT storing a per-send token row. Opt-out is keyed by email (not order)
// because each show is a fresh Orders row — a per-order flag would not carry
// the buyer's preference forward to future shows.
//
// Format: <base64url(email)>.<base64url(HMAC-SHA256(email))>
// The signing key is PAYLOAD_SECRET (already required to boot; see
// payload.config.ts), injected here so the function stays pure + testable.

function sign(email: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(email.toLowerCase()).digest()
}

export function signUnsubscribeToken(email: string, secret: string): string {
  const normalized = email.toLowerCase()
  return `${Buffer.from(normalized, 'utf8').toString('base64url')}.${sign(normalized, secret).toString('base64url')}`
}

/**
 * Returns the normalized (lowercased) email if the token is authentic, else
 * null. Constant-time signature comparison; tolerant of malformed input.
 */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  if (typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const emailPart = token.slice(0, dot)
  const sigPart = token.slice(dot + 1)
  const email = Buffer.from(emailPart, 'base64url').toString('utf8')
  if (!email) return null

  const provided = Buffer.from(sigPart, 'base64url')
  const expected = sign(email, secret)
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null
  return email.toLowerCase()
}
