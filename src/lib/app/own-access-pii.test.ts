import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Where an address may and may not appear in Cecilija (#651, ADR-0028), as a
// source scan.
//
// ADR-0024 kept a dancer's e-mail out of `/app` entirely. This ticket NARROWS
// that rather than reversing it: the reader's own address, on their own Profil,
// and nowhere else. Two halves, and this file asserts both.
//
//  1. **The roster carries no address at all.** `Members.email` is gone, so the
//     seam's projection, the screen's row type and the voditelj's form must not
//     name one. A scan rather than a runtime check because the leak this guards
//     against is a FIELD being put back — a field nobody renders yet would pass
//     any runtime assertion. Modelled on `dancer-season-no-pii.test.ts` and
//     `finance-no-pii.test.ts`.
//  2. **`viewer.email` reaches exactly one screen.** The viewer is resolved once
//     per request and handed to every page under `/app`; it is never handed to a
//     client component, and the one place its address is rendered is the field
//     on Profil where the reader writes it.
//
// Comments are stripped before the scan: they have to be allowed to name the
// words the code may not use.

const ROOT = path.resolve(__dirname, '../../..')

/** The roster stack: the seam, the pure screen rules, the voditelj's surfaces. */
const ROSTER_FILES = [
  'src/lib/repo/payload/members.ts',
  'src/lib/app/members-data.ts',
  'src/lib/app/join-data.ts',
  'src/app/app/(shell)/members/page.tsx',
  'src/app/app/(shell)/members/MembersList.tsx',
  'src/app/app/(shell)/members/[id]/page.tsx',
  'src/app/app/(shell)/members/[id]/MemberProfileForm.tsx',
] as const

// `members-screen.ts` is deliberately NOT in that list: its one mention is the
// `Omit<MemberRosterRow, 'email'>` that names the field the client projection
// must never grow, and that projection is asserted behaviourally instead, in
// members-screen.test.ts ("drops an e-mail smuggled onto the row").

/** Every spelling of an address this codebase uses. */
const ADDRESS_WORDS = ['email', 'e_mail', 'e-mail'] as const

/** Line comments, block comments and JSX comments; string literals are kept. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function code(file: string): string {
  return stripComments(readFileSync(path.join(ROOT, file), 'utf8'))
}

describe('the roster carries no address (#651)', () => {
  it.each(ROSTER_FILES)('%s names none', (file) => {
    const source = code(file).toLowerCase()
    for (const word of ADDRESS_WORDS) {
      expect(source, `${file} must not mention ${word}`).not.toContain(word)
    }
  })
})

describe('the reader’s own address reaches one screen only', () => {
  const OWN_FIELD = 'src/app/app/(shell)/account/OwnAccessForm.tsx'

  it('is rendered by the Profil form and by nothing else under /app', () => {
    // `viewer.email` is the only way an account's own address leaves the
    // viewer, so this is the whole of the search: the account page reads it and
    // hands it to the field the reader types into.
    const account = code('src/app/app/(shell)/account/page.tsx')
    expect(account).toContain('viewer.email')
    expect(code(OWN_FIELD)).toContain('email')
  })

  it('is read as a yes-or-no on Početna, never as a value', () => {
    // The card asks whether the reader owns a way in; it must never print the
    // address, and `home-screen.ts` is pure, so it cannot see one at all.
    const data = code('src/lib/app/home-data.ts')
    expect(data).toContain('viewer.email != null')
    expect(code('src/lib/app/home-screen.ts').toLowerCase()).not.toContain('viewer.email')
  })
})
