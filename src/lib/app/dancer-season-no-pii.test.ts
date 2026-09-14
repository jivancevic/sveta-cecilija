import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The privacy boundary of the season profile (#608), asserted as a source scan.
//
// The acceptance criterion is "no mobile and no e-mail anywhere on the screen,
// on anybody's profile including the reader's own". A screen cannot print what
// its view model never carried, so the check is on the projection, the loader
// and the two renderers rather than on rendered HTML.
//
// A scan rather than a runtime assertion because the leak this guards against
// is a FIELD being added — `MemberRosterRow` already carries `mobile` and
// `email` for Članovi, and a spread instead of a projection would pick both up
// silently. A field nobody renders yet would pass any runtime check. Modelled
// on `finance-no-pii.test.ts`.
//
// The NAME is deliberately not on the forbidden list: #608 is the decision that
// puts ime i prezime in front of a dancer, and this file exists to hold the
// line where that decision drew it.
//
// Comments are stripped before the scan: the module comments explain the rule
// and must be allowed to name the words the code may not use.

const ROOT = path.resolve(__dirname, '../../..')

/** Everything the profile is made of: the projection, the loader, the screens. */
const PROFILE_FILES = [
  'src/lib/app/dancer-season.ts',
  'src/lib/app/dancer-season-data.ts',
  'src/lib/app/profile-rings.ts',
  'src/app/app/(shell)/leaderboard/DancerProfileView.tsx',
  'src/app/app/(shell)/leaderboard/[memberId]/page.tsx',
] as const

/**
 * The contact half of a Member, in every spelling this codebase uses: the
 * Payload field names, their snake_case columns, and the bare words.
 */
const CONTACT_WORDS = ['mobile', 'mobitel', 'email', 'e_mail', 'phone', 'telefon'] as const

/** Line comments, block comments and JSX comments; string literals are kept. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('a season profile carries no contact detail', () => {
  it.each(PROFILE_FILES)('%s names no mobile and no address', (file) => {
    const code = stripComments(readFileSync(path.join(ROOT, file), 'utf8')).toLowerCase()
    for (const word of CONTACT_WORDS) {
      expect(code, `${file} must not mention ${word}`).not.toContain(word)
    }
  })

  it('projects the roster row rather than spreading it', () => {
    // `MemberRosterRow` carries the mobile and the e-mail because Članovi needs
    // the first. A spread would carry both onto a screen every moreškant can
    // open, which is exactly the shape ADR-0024's boundary forbids.
    const code = stripComments(
      readFileSync(path.join(ROOT, 'src/lib/app/dancer-season.ts'), 'utf8'),
    )
    expect(code).not.toMatch(/\.\.\.row/)
    expect(code).toContain('toDancerIdentity')
  })
})
