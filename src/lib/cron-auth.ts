// The shared bearer check for the cron routes (#440 review).
//
// Both scheduled endpoints (`/api/cron/send-review-emails`,
// `/api/cron/moreskant-notifications`) authenticate with the same
// `CRON_SECRET`, and both compare it here so the two cannot drift apart.
//
// The comparison is `timingSafeEqual` rather than `===`. A plain string compare
// returns as soon as two bytes differ, so the time it takes leaks how much of a
// guess was right, one byte at a time. That is only a real attack over a very
// long series of requests against a very stable server, which is exactly what a
// scheduler-facing URL on a small box is — and the fix is one line.
//
// `timingSafeEqual` THROWS on buffers of different length, so the length check
// comes first and is deliberately not constant-time: the length of a secret is
// not the secret.

import { timingSafeEqual } from 'node:crypto'

/** True when `header` is exactly `Bearer <secret>`. */
export function bearerMatches(header: string | null | undefined, secret: string): boolean {
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  const given = Buffer.from(header ?? '', 'utf8')
  if (given.length !== expected.length) return false
  return timingSafeEqual(given, expected)
}
