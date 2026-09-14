// The line at the foot of Više: which Cecilija is this, exactly (#569, Q20).
//
// Two facts and nothing else. The VERSION is `package.json`'s, imported rather
// than re-typed, and the COMMIT is the deployed revision — read through
// `deployedCommit()` in `src/lib/health/health.ts`, which is the same function
// `GET /api/health` reports from.
//
// That shared read is the whole point of this module. The version line exists
// so a voditelj on the phone can tell a developer what they are looking at, and
// a second `process.env.SOURCE_COMMIT` here would be a second answer to that
// question the day one of them is renamed. The acceptance test (`version.test.ts`)
// asserts the two agree for the same environment.
//
// Pure and server-side: the line is rendered on the server, so `package.json`
// never reaches a phone.

import pkg from '../../../package.json'
import { APP_STRINGS } from './strings'

/** `package.json`'s version, the one place it is read. */
export const APP_VERSION: string = pkg.version

/**
 * "Cecilija · 0.1.0 (ad0eb9c)", or without the parenthesis outside a deploy.
 *
 * A local build and a `next start` on a laptop have no `SOURCE_COMMIT`, and a
 * line that printed "(null)" or an empty pair of brackets there would read as a
 * bug in the app rather than as the absence of a deploy.
 */
export function versionLine(input: { version: string; commit: string | null }): string {
  const head = `${APP_STRINGS.name} · ${input.version}`
  return input.commit ? `${head} (${input.commit})` : head
}
