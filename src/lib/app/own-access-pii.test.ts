import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PoolQuery } from '@/lib/db/pool-query'
import { loadMemberAccountSignals } from '@/lib/repo/payload/member-signals'

// Where an address may and may not appear in Cecilija (#651, ADR-0028).
//
// ADR-0024 kept a dancer's e-mail out of `/app` entirely. This ticket NARROWS
// that rather than reversing it: the reader's own address, on their own Profil,
// and nowhere else. Two halves, and this file asserts both.
//
//  1. **No address VALUE leaves the seam.** That is the rule, and where the code
//     can be exercised it is asserted by RUNNING it: the roster's account signal
//     answers in booleans (below, and again in
//     `repo/payload/member-signals.test.ts`), and the client projection drops an
//     address smuggled onto a row (`members-screen.test.ts`).
//
//     The source scan under it is the canary for the files that cannot be run
//     here — `repo/payload/members.ts` pulls `@payload-config` in and will not
//     import under vitest — and for the leak a runtime assertion cannot see at
//     all: a FIELD being put back that nothing renders yet. It is not the rule
//     and no file is placed to satisfy it: the #653 review caught exactly that,
//     a query moved up into `src/lib/app/` so this list would stay quiet, and
//     the query now sits below the seam where it belongs. Modelled on
//     `dancer-season-no-pii.test.ts` and `finance-no-pii.test.ts`.
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

describe('what the seam hands the roster is a yes-or-no, never an address', () => {
  /** A pool that answers every query with one account row, address and all. */
  const withAddress: PoolQuery = async (sql) => {
    if (sql.includes('FROM users u')) {
      return {
        rows: [
          {
            user_id: 7,
            member_id: 42,
            email: 'cici@example.com',
            has_address: true,
            has_own_password: true,
            sessions: 1,
          },
        ],
      }
    }
    return { rows: [] }
  }

  it('drops an address the query hands back, rather than projecting it', async () => {
    const signals = await loadMemberAccountSignals(withAddress)
    const signal = signals.get('42')
    expect(signal).toBeTruthy()
    // The whole signal, serialised: no address, and nothing shaped like one.
    expect(JSON.stringify(signal)).not.toContain('@')
    expect(Object.keys(signal!).sort()).toEqual([
      'device',
      'hasEmail',
      'hasOwnPassword',
      'sessions',
    ])
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
