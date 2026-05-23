import { randomBytes } from 'crypto'

/**
 * URL-safe base64 of 18 random bytes → 24 chars, ~144 bits of entropy.
 * Safe to embed in `/scan/[token]` URLs without further encoding.
 */
export function generateQrToken(): string {
  return randomBytes(18).toString('base64url')
}
