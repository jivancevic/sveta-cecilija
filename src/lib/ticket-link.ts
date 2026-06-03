import { createHmac, timingSafeEqual } from 'node:crypto'

// The signed `?t=` link is minted fresh on every render of the (force-dynamic)
// confirmation page, and the ticket email delivers the PDF as an attachment with
// no link. So legitimate downloads always use a seconds-old link; the TTL only
// bounds how long a manually copied download URL stays live if it leaks. 7 days
// covers the post-purchase window while keeping that leak window short. See
// ADR-0014.
const DEFAULT_TTL_DAYS = 7

function getSecret(): string {
  const s = process.env.TICKET_LINK_SECRET
  if (!s) throw new Error('TICKET_LINK_SECRET is not set')
  return s
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(createHmac('sha256', secret).update(payload).digest())
}

export interface SignTicketLinkInput {
  orderId: string | number
  email: string
  ttlDays?: number
}

export function signTicketLink(input: SignTicketLinkInput): string {
  const ttl = (input.ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60
  const exp = Math.floor(Date.now() / 1000) + ttl
  const payload = `${input.orderId}.${input.email.toLowerCase()}.${exp}`
  const sig = sign(payload, getSecret())
  return b64urlEncode(Buffer.from(`${exp}.${sig}`))
}

export type VerifyTicketLinkResult =
  | { ok: true }
  | { ok: false; reason: 'malformed' | 'expired' | 'invalid' }

export function verifyTicketLink(
  token: string,
  orderId: string | number,
  email: string,
): VerifyTicketLinkResult {
  let decoded: string
  try {
    decoded = b64urlDecode(token).toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const dot = decoded.indexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }
  const expStr = decoded.slice(0, dot)
  const sigGiven = decoded.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp)) return { ok: false, reason: 'malformed' }
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' }

  const expected = sign(`${orderId}.${email.toLowerCase()}.${exp}`, getSecret())
  const a = Buffer.from(expected)
  const b = Buffer.from(sigGiven)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid' }
  }
  return { ok: true }
}
