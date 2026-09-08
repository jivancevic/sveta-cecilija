import { describe, expect, it } from 'vitest'
import {
  LINEUP_ERRORS,
  buildLineupFromAttendance,
  roleWarnings,
  suggestedRole,
  validateLineupEntries,
} from './rules'
import type { AttendanceMember } from '@/lib/attendance/rules'
import type { AttendanceRow } from '@/lib/attendance/army-count'

// #432 — the three lineup rules, driven from outside over fixture rows, the
// `rules.test.ts` / `army-count.test.ts` prior art.

const member = (over: Partial<AttendanceMember> & { id: string }): AttendanceMember => ({
  nickname: `N${over.id}`,
  roles: ['crni'],
  primaryRole: 'crni',
  active: true,
  isMoreskant: true,
  ...over,
})

const cici = member({ id: '1', nickname: 'Cici', roles: ['crni', 'crni_kralj'], primaryRole: 'crni_kralj' })
const dado = member({ id: '2', nickname: 'Dado', roles: ['bili'], primaryRole: 'bili' })
const grgo = member({ id: '3', nickname: 'Grgo', roles: ['crni', 'bili'], primaryRole: 'crni' })
const mare = member({ id: '4', nickname: 'Mare', roles: ['bula'], primaryRole: 'bula' })
const otman = member({ id: '5', nickname: 'Otman', roles: ['crni', 'otmanovic'], primaryRole: 'otmanovic' })

const roster = [cici, dado, grgo, mare, otman]

const answer = (memberId: string, status: 'coming' | 'not_coming', army: 'crni' | 'bili' | null): AttendanceRow => ({
  memberId,
  status,
  army,
})

describe('suggestedRole', () => {
  it('keeps a special role when the stored army agrees with it', () => {
    // The army was DERIVED from the primary role on create, so it is not a
    // decision and must not demote the king to a plain crni.
    expect(suggestedRole(cici, 'crni')).toBe('crni_kralj')
    expect(suggestedRole(otman, 'crni')).toBe('otmanovic')
  })

  it('lets an army that contradicts the primary role win', () => {
    // The voditelj moved them across for this evening ("Prebaci u ...").
    expect(suggestedRole(cici, 'bili')).toBe('bili')
    expect(suggestedRole(grgo, 'bili')).toBe('bili')
  })

  it('falls back to the primary role when no army is stored', () => {
    expect(suggestedRole(dado, null)).toBe('bili')
    expect(suggestedRole(cici, null)).toBe('crni_kralj')
  })

  it('leaves a bula a bula: they carry no army at all', () => {
    expect(suggestedRole(mare, null)).toBe('bula')
  })

  it('falls back to the army, then to crni, for a profile with no usable primary role', () => {
    const legacy = member({ id: '9', roles: [], primaryRole: null })
    expect(suggestedRole(legacy, 'bili')).toBe('bili')
    expect(suggestedRole(legacy, null)).toBe('crni')
  })
})

describe('buildLineupFromAttendance', () => {
  it('takes every "dolazim" in their suggested role, in roster order', () => {
    const rows = [
      answer('2', 'coming', 'bili'),
      answer('1', 'coming', 'crni'),
      answer('4', 'coming', null),
    ]
    expect(buildLineupFromAttendance(rows, roster)).toEqual([
      { memberId: '1', role: 'crni_kralj' },
      { memberId: '2', role: 'bili' },
      { memberId: '4', role: 'bula' },
    ])
  })

  it('excludes "ne dolazim" and no answer', () => {
    const rows = [answer('1', 'coming', 'crni'), answer('2', 'not_coming', null)]
    // Grgo, Mare and Otman never answered; Dado said no.
    expect(buildLineupFromAttendance(rows, roster)).toEqual([
      { memberId: '1', role: 'crni_kralj' },
    ])
  })

  it('lets an assigned army override the primary role', () => {
    const rows = [answer('3', 'coming', 'bili')]
    expect(buildLineupFromAttendance(rows, roster)).toEqual([{ memberId: '3', role: 'bili' }])
  })

  it('ignores an answer from somebody who is no longer on the roster', () => {
    expect(buildLineupFromAttendance([answer('99', 'coming', 'crni')], roster)).toEqual([])
  })

  it('is empty when nobody has answered', () => {
    expect(buildLineupFromAttendance([], roster)).toEqual([])
  })
})

describe('roleWarnings', () => {
  it('says nothing about a role the profile lists', () => {
    expect(roleWarnings([{ memberId: '1', role: 'crni_kralj' }], roster)).toEqual([])
  })

  it('warns about a role outside the profile, and it is only a warning', () => {
    const warnings = roleWarnings([{ memberId: '2', role: 'bula' }], roster)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].memberId).toBe('2')
    expect(warnings[0].role).toBe('bula')
    expect(warnings[0].message).toContain('Dado')
    expect(warnings[0].message).toContain('Bula')
  })

  it('warns about a member who is not on the roster at all', () => {
    const warnings = roleWarnings([{ memberId: '77', role: 'crni' }], roster)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('nije na popisu')
  })

  it('reports one warning per offending entry and nothing for the rest', () => {
    const warnings = roleWarnings(
      [
        { memberId: '1', role: 'crni' },
        { memberId: '2', role: 'crni' },
        { memberId: '4', role: 'crni_kralj' },
      ],
      roster,
    )
    expect(warnings.map((w) => w.memberId)).toEqual(['2', '4'])
  })
})

describe('validateLineupEntries', () => {
  it('accepts a well-formed list and normalises numeric ids to strings', () => {
    const result = validateLineupEntries(
      [
        { memberId: 1, role: 'crni_kralj' },
        { memberId: '2', role: 'bili' },
      ],
      roster,
    )
    expect(result).toEqual({
      ok: true,
      entries: [
        { memberId: '1', role: 'crni_kralj' },
        { memberId: '2', role: 'bili' },
      ],
    })
  })

  it('accepts an empty lineup: a voditelj may clear one', () => {
    expect(validateLineupEntries([], roster)).toEqual({ ok: true, entries: [] })
  })

  it('refuses anything that is not a list', () => {
    for (const bad of [undefined, null, 'crni', 42, { memberId: '1' }]) {
      expect(validateLineupEntries(bad, roster)).toEqual({
        ok: false,
        error: LINEUP_ERRORS.notAList,
      })
    }
  })

  it('refuses an entry with no member or no role', () => {
    expect(validateLineupEntries([{ role: 'crni' }], roster).ok).toBe(false)
    expect(validateLineupEntries([{ memberId: '1' }], roster)).toEqual({
      ok: false,
      error: LINEUP_ERRORS.unknownRole,
    })
    expect(validateLineupEntries([null], roster)).toEqual({
      ok: false,
      error: LINEUP_ERRORS.badEntry,
    })
  })

  it('refuses a role outside the vocabulary', () => {
    expect(validateLineupEntries([{ memberId: '1', role: 'kapetan' }], roster)).toEqual({
      ok: false,
      error: LINEUP_ERRORS.unknownRole,
    })
  })

  // Story 30: exactly one role per dancer, so statistics never double count.
  it('refuses the same member twice', () => {
    expect(
      validateLineupEntries(
        [
          { memberId: '1', role: 'crni' },
          { memberId: '1', role: 'crni_kralj' },
        ],
        roster,
      ),
    ).toEqual({ ok: false, error: LINEUP_ERRORS.duplicateMember })
  })

  it('refuses somebody who is not an active moreškant', () => {
    expect(validateLineupEntries([{ memberId: '404', role: 'crni' }], roster)).toEqual({
      ok: false,
      error: LINEUP_ERRORS.unknownMember,
    })
  })
})
