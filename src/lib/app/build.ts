// The line at the foot of Više: which Cecilija is this, exactly (#569, #637).
//
// ONE fact, the deployed commit, read through `deployedCommit()` in
// `src/lib/health/health.ts` — the same function `GET /api/health` reports
// from. That shared read is the whole point of this module: the line exists so
// a voditelj on a phone can tell a developer which build they are looking at,
// and a second `process.env.SOURCE_COMMIT` read here would be a second answer
// to that question the day Coolify's variable is renamed. `build.test.ts`
// asserts the two agree for the same environment.
//
// **There is no version here, and that is the decision rather than an omission**
// (#637). `package.json`'s `0.1.0` had not moved since the repo's first commit,
// so it looked like information and was not. Nor was it replaced: `main`
// auto-deploys (ADR-0026) at roughly twenty merges a day, so any scheme that
// writes a version into `package.json` costs a bot commit and a second deploy
// per merge, and at that tempo a semver read back over the phone tells the
// developer nothing until they go look up what the number was. The commit
// already answers the only question the line is asked.
//
// Pure and server-side. The sha is not meant to be TRANSCRIBED — seven
// characters carrying `0`/`O` and `b`/`6` are exactly what CONTEXT.md's
// temporary-password alphabet exists to avoid — so it leaves the phone two
// other ways: the line is tappable and copies itself, and Podrška writes it
// into the mail body.

import { APP_STRINGS } from './strings'

/**
 * "Cecilija · ad0eb9c", or the bare name outside a deploy.
 *
 * A local build and a `next start` on a laptop have no `SOURCE_COMMIT`, and a
 * line that printed "(null)" or an empty pair of brackets there would read as a
 * bug in the app rather than as the absence of a deploy.
 */
export function buildLine(commit: string | null): string {
  return commit ? `${APP_STRINGS.name} · ${commit}` : APP_STRINGS.name
}
