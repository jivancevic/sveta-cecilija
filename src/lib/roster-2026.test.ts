// The 2026 roster import, checked against the real moreškant rules.
//
// `scripts/import-moreskanti-2026.mjs` writes with raw SQL, which bypasses the
// Members `beforeValidate` hook. This test is where that hook's rules are
// applied instead: every row goes through the same
// `validateAndNormaliseMoreskant` the admin calls, so the import cannot carry a
// profile the admin would have rejected, and the dance-role vocabulary is never
// re-typed anywhere (CLAUDE.md hard rule).
//
// It also pins the two facts a reviewer would otherwise have to take on trust:
// how many people are on the list, and which of them are in the system without
// dancing this season.
import { describe, expect, it } from 'vitest'
import {
  DANCE_ROLES,
  nicknameKey,
  validateAndNormaliseMoreskant,
} from './moreskant-profile'
import { ROSTER } from '../../scripts/import-moreskanti-2026.mjs'

interface RosterEntry {
  name: string
  nickname: string
  mobile: string | null
  primaryRole: string
  roles: string[]
  active?: boolean
}

const roster = ROSTER as RosterEntry[]

/** Kept in the system, not dancing this season (the six the voditelj bracketed). */
const NOT_DANCING = [
  'Todor Foretić',
  'Mihael Matković',
  'Marko Vilović',
  'Tomislav Denoble',
  'Hrvoje Terzić',
  'Ivan Šegedin',
]

describe('2026 roster import', () => {
  it('has the 76 people the voditelj listed', () => {
    expect(roster).toHaveLength(76)
  })

  it('passes the real moreškant profile rules for every row', () => {
    for (const entry of roster) {
      const others = roster.filter((r) => r !== entry).map((r) => r.nickname)
      expect(() =>
        validateAndNormaliseMoreskant(
          { isMoreskant: true, ...entry },
          { otherNicknames: others },
        ),
        `${entry.name} (${entry.nickname})`,
      ).not.toThrow()
    }
  })

  it('has no two nicknames that collide case-insensitively', () => {
    const keys = roster.map((r) => nicknameKey(r.nickname))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('uses only names from the dance-role vocabulary', () => {
    for (const entry of roster) {
      for (const role of entry.roles) expect(DANCE_ROLES).toContain(role)
      expect(DANCE_ROLES).toContain(entry.primaryRole)
    }
  })

  it('stores every mobile in international form, or none at all', () => {
    for (const entry of roster) {
      if (entry.mobile === null) continue
      // Croatian mobile: +385 then a 9-prefixed subscriber number.
      expect(entry.mobile, entry.name).toMatch(/^\+3859\d{7,8}$/)
    }
  })

  it('leaves exactly the eight bule without a number', () => {
    const missing = roster.filter((r) => !r.mobile)
    expect(missing).toHaveLength(8)
    for (const r of missing) expect(r.primaryRole).toBe('bula')
  })

  it('marks exactly the six who are not dancing this season', () => {
    const inactive = roster.filter((r) => r.active === false).map((r) => r.name)
    expect(inactive.sort()).toEqual([...NOT_DANCING].sort())
  })

  it('names nobody twice', () => {
    const names = roster.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
