import { createHmac, timingSafeEqual } from 'crypto'

// Stateless per-order refund tokens for the self-serve reschedule refund
// (ADR-0021). The reschedule email carries `<orderId>.<HMAC>` so the buyer can
// cancel + refund their own order from a link WITHOUT a login and WITHOUT any
// stored token row. Possession of a token that verifies is authorization for
// that one order; all *eligibility* (show rescheduled, online channel, not
// scanned, not already refunded) is re-derived server-side, so the token proves
// identity only and never expires.
//
// Deliberately identical in shape to the marketing unsubscribe token
// (src/lib/marketing/unsubscribe-token.ts) — same HMAC-SHA256 construction,
// same PAYLOAD_SECRET signing key, same constant-time verify — because it is the
// established pattern for an unauthenticated public mutation gated by a signed
// link. The signed payload here is the ORDER ID, not an email.
//
// Format: <base64url(orderId)>.<base64url(HMAC-SHA256(orderId))>
// The signing key is PAYLOAD_SECRET (already required to boot; see
// payload.config.ts), injected here so the function stays pure + testable.

function sign(orderId: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(orderId).digest()
}

export function signRescheduleRefundToken(orderId: string, secret: string): string {
  const id = String(orderId)
  return `${Buffer.from(id, 'utf8').toString('base64url')}.${sign(id, secret).toString('base64url')}`
}

/**
 * Returns the order id if the token is authentic, else null. Constant-time
 * signature comparison; tolerant of malformed input.
 */
export function verifyRescheduleRefundToken(token: string, secret: string): string | null {
  if (typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const idPart = token.slice(0, dot)
  const sigPart = token.slice(dot + 1)
  const orderId = Buffer.from(idPart, 'base64url').toString('utf8')
  if (!orderId) return null

  const provided = Buffer.from(sigPart, 'base64url')
  const expected = sign(orderId, secret)
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null
  return orderId
}
