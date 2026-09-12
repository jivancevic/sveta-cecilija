import { describe, expect, it } from 'vitest'
import { countArmies, type AttendanceRow } from './army-count'
import type { AttendanceMember } from './rules'

// #422 — the army count is the single home of the counting rule (glossary:
// *Army count*), so the kings, the bula and the no-answer list are asserted
// here and nowhere else.

const member = (
  id: string,
  nickname: string,
  primaryRole: string,
  roles: string[] = [primaryRole],
  mobile: string | null = null,
): AttendanceMember => ({
  id,
  nickname,
  mobile,
  roles,
  primaryRole,
  active: true,
  isMoreskant: true,
})

const roster: AttendanceMember[] = [
  member('1', 'Cici', 'crni', ['crni'], '+385911111111'),
  member('2', 'Bepo', 'crni_kralj', ['crni', 'crni_kralj']),
  member('3', 'Ćiro', 'otmanovic', ['crni', 'otmanovic']),
  member('4', 'Dado', 'bili', ['bili']),
  member('5', 'Eno', 'bili_kralj', ['bili', 'bili_kralj']),
  member('6', 'Frane', 'bula', ['bula']),
  member('7', 'Grgo', 'crni', ['crni', 'bili']),
]

const coming = (memberId: string, army: 'crni' | 'bili' | null): AttendanceRow => ({
  memberId,
  status: 'coming',
  army,
})

const thresholds = { crni: 3, bili: 2 }

describe('countArmies', () => {
  it('counts kings and the otmanović in their own army', () => {
    const out = countArmies(
      [coming('1', 'crni'), coming('2', 'crni'), coming('3', 'crni')],
      roster,
      thresholds,
    )
    expect(out.crni.count).toBe(3)
    expect(out.crni.nicknames).toEqual(['Bepo', 'Cici', 'Ćiro'])
    expect(out.bili.count).toBe(0)
  })

  it('a bula is counted in neither army', () => {
    const out = countArmies([coming('6', null)], roster, thresholds)
    expect(out.crni.count).toBe(0)
    expect(out.bili.count).toBe(0)
    expect(out.bula.map((p) => p.nickname)).toEqual(['Frane'])
  })

  it('falls back to the primary role army when the row carries no army', () => {
    const out = countArmies([coming('5', null)], roster, thresholds)
    expect(out.bili.nicknames).toEqual(['Eno'])
    expect(out.bula).toEqual([])
  })

  it('honours the army the voditelj moved a dual-role dancer to', () => {
    const out = countArmies([coming('7', 'bili')], roster, thresholds)
    expect(out.bili.nicknames).toEqual(['Grgo'])
    expect(out.crni.count).toBe(0)
  })

  it('compares each army against its own threshold', () => {
    const out = countArmies(
      [coming('1', 'crni'), coming('4', 'bili'), coming('5', 'bili')],
      roster,
      thresholds,
    )
    expect(out.crni).toMatchObject({ count: 1, threshold: 3, below: true })
    expect(out.bili).toMatchObject({ count: 2, threshold: 2, below: false })
  })

  it('splits not-coming out of every headcount', () => {
    const out = countArmies(
      [{ memberId: '1', status: 'not_coming', army: 'crni' }],
      roster,
      thresholds,
    )
    expect(out.crni.count).toBe(0)
    expect(out.notComing.map((p) => p.nickname)).toEqual(['Cici'])
    expect(out.noAnswer.map((p) => p.nickname)).not.toContain('Cici')
  })

  it('builds no-answer from the active moreškanti minus everyone who answered', () => {
    const out = countArmies(
      [coming('1', 'crni'), { memberId: '4', status: 'not_coming', army: 'bili' }],
      roster,
      thresholds,
    )
    expect(out.noAnswer.map((p) => p.nickname)).toEqual(['Bepo', 'Ćiro', 'Eno', 'Frane', 'Grgo'])
  })

  it('an empty roster answers with empty lists, not a crash', () => {
    const out = countArmies([], [], thresholds)
    expect(out).toMatchObject({ bula: [], notComing: [], noAnswer: [] })
    expect(out.crni.below).toBe(true)
  })

  it('ignores a row whose member is no longer on the roster', () => {
    const out = countArmies([coming('99', 'crni')], roster, thresholds)
    expect(out.crni.count).toBe(0)
    expect(out.noAnswer).toHaveLength(roster.length)
  })

  it('carries mobiles and never an email field', () => {
    const out = countArmies([coming('1', 'crni')], roster, thresholds)
    expect(out.crni.members[0]).toEqual({
      memberId: '1',
      nickname: 'Cici',
      mobile: '+385911111111',
    })
  })
})
