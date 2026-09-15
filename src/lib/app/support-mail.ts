// The `mailto:` behind Podrška (#637).
//
// Until this ticket the sheet offered a bare `mailto:info@moreska.eu` with no
// subject and no body, which means every support mail arrived saying only what
// the person thought to type. That is fine for "ne mogu se prijaviti" and
// useless for "ne radi mi", where the first question back is always which build
// and which account.
//
// So this is the path the build actually leaves the phone by. The footer shows
// the sha and can be tapped to copy it, but nobody should be TRANSCRIBING seven
// characters carrying `0`/`O` and `b`/`6` — that is the same hazard CONTEXT.md's
// temporary-password alphabet exists to avoid — and here nobody has to.
//
// Three things go in the body and nothing else:
//
//   1. An opening line in Croatian, because an empty mail body gets closed
//      rather than filled.
//   2. The **account username**. This is not padding: `tehnika` has no e-mail
//      address of its own (ADR-0022), so a mail about the door tablet arrives
//      from the private address of whoever is holding it and nothing in it says
//      which Cecilija account was signed in.
//   3. The build.
//
// E-mail only, and never a telephone number (CLAUDE.md, #383, #548) — asserted
// in `build.test.ts` rather than left to a reviewer's eye.
//
// Pure, so it is tested without a component and without a browser.

import { APP_STRINGS } from './strings'

const S = APP_STRINGS.support

export interface SupportMailInput {
  /** Short sha, or null on a laptop with no `SOURCE_COMMIT`. */
  commit: string | null
  /** The signed-in account's username, or null if the session has none. */
  username: string | null
}

/**
 * `mailto:info@moreska.eu?subject=…&body=…`, ready for an `<a href>`.
 *
 * A missing commit or username drops its whole line rather than printing an
 * empty label: "Build:" followed by nothing reads as a broken app, and
 * "Račun: null" reads as a broken developer.
 */
export function supportMailto({ commit, username }: SupportMailInput): string {
  const footer: string[] = []
  if (username) footer.push(`${S.mailAccount} ${username}`)
  if (commit) footer.push(`${S.mailBuild} ${commit}`)

  // Two blank lines under the prompt: that gap is where the person types, and
  // a mail client puts the cursor at the top of the body.
  const parts = [S.mailIntro, '', '']
  if (footer.length > 0) parts.push('--', ...footer)

  const query = new URLSearchParams({ subject: S.mailSubject, body: parts.join('\n') })

  // `URLSearchParams` spells a space `+`, which several mail clients paste
  // literally into the subject line. Percent-encoding is what every one of them
  // understands.
  return `mailto:${S.email}?${query.toString().replace(/\+/g, '%20')}`
}
