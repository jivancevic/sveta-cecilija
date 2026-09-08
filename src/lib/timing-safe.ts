// One constant-time string comparison for every secret in a URL or a header.
//
// Extracted from `cron-auth.ts` (#440 review) when the calendar feed (#433)
// needed the same thing for a token in a PATH. A path token is an even better
// timing target than a bearer header: it is fetched every hour by a calendar
// client, so a stable, repeatable request against the same endpoint is the
// normal traffic pattern rather than a suspicious one.
//
// `timingSafeEqual` THROWS on buffers of different length, so the length check
// comes first and is deliberately not constant-time: the length of a secret is
// not the secret.

import { timingSafeEqual } from 'node:crypto'

/** True when `given` equals `expected`, in time that does not depend on where they differ. */
export function secretMatches(given: string | null | undefined, expected: string): boolean {
  if (!expected) return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(given ?? '', 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
