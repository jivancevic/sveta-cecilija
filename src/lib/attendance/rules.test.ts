import { describe, expect, it } from 'vitest'
import {
  ANSWER_ERRORS,
  allowedArmies,
  decideAttendanceAnswer,
  defaultArmyOf,
  isAnswerableMember,
  type AttendanceActor,
  type AttendanceMember,
  type AttendancePerformance,
} from './rules'

// #422 — the answer rules, table-driven over role × target × time × cancelled ×
// army/role, which is exactly the matrix the ticket asks for.

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)
const LATER = NOW + 6 * 60 * 60 * 1000
const EARLIER = NOW - 6 * 60 * 60 * 1000

const voditelj: AttendanceActor = { user: { permissions: ['moreska'] }, memberId: null }
const voditeljWhoDances: AttendanceActor = {
  user: { permissions: ['moreska', 'moreskant'] },
  memberId: '1',
}
const cici: AttendanceActor = { user: { permissions: ['moreskant'] }, memberId: '1' }
const ticketAdmin: AttendanceActor = { user: { permissions: ['tickets', 'refunds'] }, memberId: null }
const anon: AttendanceActor = { user: null, memberId: null }

const dancer = (over: Partial<AttendanceMember> = {}): AttendanceMember => ({
  id: '1',
  nickname: 'Cici',
  roles: ['crni'],
  primaryRole: 'crni',
  active: true,
  isMoreskant: true,
  ...over,
})

const upcoming: AttendancePerformance = { id: '10', startMs: LATER, cancelled: false }
const started: AttendancePerformance = { id: '11', startMs: EARLIER, cancelled: false }
const cancelled: AttendancePerformance = { id: '12', startMs: LATER, cancelled: true }

function decide(over: Partial<Parameters<typeof decideAttendanceAnswer>[0]> = {}) {
  return decideAttendanceAnswer({
    actor: cici,
    member: dancer(),
    performance: upcoming,
    request: 'coming',
    nowMs: NOW,
    ...over,
  })
}

describe('defaultArmyOf', () => {
  it.each([
    ['crni', 'crni'],
    ['crni_kralj', 'crni'],
    ['otmanovic', 'crni'],
    ['bili', 'bili'],
    ['bili_kralj', 'bili'],
  ] as const)('primary role %s lands in %s', (primaryRole, army) => {
    expect(defaultArmyOf(dancer({ primaryRole, roles: [primaryRole] }))).toBe(army)
  })

  it('a bula is in neither army', () => {
    expect(defaultArmyOf(dancer({ primaryRole: 'bula', roles: ['bula'] }))).toBeNull()
  })

  it('a bula primary role wins over any other role held', () => {
    expect(defaultArmyOf(dancer({ primaryRole: 'bula', roles: ['bula', 'crni'] }))).toBeNull()
  })

  it('falls back to the roles when the primary role is missing or unknown', () => {
    expect(defaultArmyOf(dancer({ primaryRole: null, roles: ['bili'] }))).toBe('bili')
    expect(defaultArmyOf(dancer({ primaryRole: 'kapetan', roles: ['crni'] }))).toBe('crni')
    expect(defaultArmyOf(dancer({ primaryRole: null, roles: [] }))).toBeNull()
  })
})

describe('allowedArmies', () => {
  it('lists only armies the roles actually cover', () => {
    expect(allowedArmies(dancer({ roles: ['crni'] }))).toEqual(['crni'])
    expect(allowedArmies(dancer({ roles: ['bili', 'bili_kralj'] }))).toEqual(['bili'])
    expect(allowedArmies(dancer({ roles: ['bula'] }))).toEqual([])
  })

  it('a dual-role dancer may be moved either way', () => {
    expect(allowedArmies(dancer({ roles: ['bili', 'crni'] }))).toEqual(['crni', 'bili'])
  })
})

describe('isAnswerableMember', () => {
  it.each([
    ['a live moreškant', dancer(), true],
    ['a retired moreškant', dancer({ active: false }), false],
    ['a comp-attribution member', dancer({ isMoreskant: false }), false],
    ['nothing at all', null, false],
  ])('%s', (_label, member, expected) => {
    expect(isAnswerableMember(member)).toBe(expected)
  })
})

describe('decideAttendanceAnswer — who may answer', () => {
  it('a moreškant answers for themselves', () => {
    expect(decide()).toEqual({ ok: true, op: 'write', status: 'coming', army: 'crni' })
  })

  it('a moreškant may not answer for anyone else', () => {
    const out = decide({ member: dancer({ id: '2', nickname: 'Bepo' }) })
    expect(out).toEqual({ ok: false, status: 403, error: ANSWER_ERRORS.notAllowed })
  })

  it('a moreškant with no Member link answers for nobody', () => {
    const out = decide({ actor: { user: { permissions: ['moreskant'] }, memberId: null } })
    expect(out).toMatchObject({ ok: false, status: 403 })
  })

  it('a voditelj answers for any dancer', () => {
    expect(decide({ actor: voditelj, member: dancer({ id: '9', nickname: 'Bepo' }) })).toEqual({
      ok: true,
      op: 'write',
      status: 'coming',
      army: 'crni',
    })
  })

  it('a voditelj who dances answers for themselves too', () => {
    expect(decide({ actor: voditeljWhoDances })).toMatchObject({ ok: true, op: 'write' })
  })

  it.each([
    ['a ticket admin', ticketAdmin],
    ['an anonymous caller', anon],
  ])('%s is refused', (_label, actor) => {
    expect(decide({ actor })).toEqual({ ok: false, status: 403, error: ANSWER_ERRORS.notAllowed })
  })

  it.each([
    ['a retired member', dancer({ active: false })],
    ['a member who is not a moreškant', dancer({ isMoreskant: false })],
    ['a member that does not exist', null],
  ])('%s takes no answer (400)', (_label, member) => {
    expect(decide({ actor: voditelj, member })).toEqual({
      ok: false,
      status: 400,
      error: ANSWER_ERRORS.notMoreskant,
    })
  })

  // The order of the two checks is the point: a dancer asking about somebody
  // else always hears "not yours", never "that one is not a live moreškant".
  // Otherwise the status code alone would let them walk the Members table and
  // read off who is on the roster.
  it.each([
    ['a stranger who is a live moreškant', dancer({ id: '2' })],
    ['a stranger who is retired', dancer({ id: '2', active: false })],
    ['a stranger who is not a moreškant at all', dancer({ id: '2', isMoreskant: false })],
    ['a Member id that does not exist', null],
  ])('a moreškant asking about %s hears only 403', (_label, member) => {
    expect(decide({ member, memberId: '2' })).toEqual({
      ok: false,
      status: 403,
      error: ANSWER_ERRORS.notAllowed,
    })
  })

  it('a moreškant whose own Member row went stale still gets 400, not a leak', () => {
    // Their own id, so the self check passes; the row is simply no longer a
    // dancer, which is theirs to be told about.
    expect(decide({ member: dancer({ active: false }), memberId: '1' })).toMatchObject({
      status: 400,
    })
  })
})

describe('decideAttendanceAnswer — when', () => {
  it('a moreškant is locked out once the performance has started', () => {
    expect(decide({ performance: started })).toEqual({
      ok: false,
      status: 403,
      error: ANSWER_ERRORS.started,
    })
  })

  it('the boundary is the start instant itself', () => {
    expect(decide({ performance: { id: '13', startMs: NOW, cancelled: false } })).toMatchObject({
      ok: false,
      status: 403,
    })
    expect(
      decide({ performance: { id: '13', startMs: NOW + 1, cancelled: false } }),
    ).toMatchObject({ ok: true })
  })

  it('a moreškant may not answer a cancelled performance', () => {
    expect(decide({ performance: cancelled })).toEqual({
      ok: false,
      status: 403,
      error: ANSWER_ERRORS.cancelled,
    })
  })

  it('a voditelj answers after the start and on a cancelled performance', () => {
    expect(decide({ actor: voditelj, performance: started })).toMatchObject({ ok: true })
    expect(decide({ actor: voditelj, performance: cancelled })).toMatchObject({ ok: true })
  })
})

describe('decideAttendanceAnswer — what', () => {
  it('accepts not_coming', () => {
    expect(decide({ request: 'not_coming' })).toEqual({
      ok: true,
      op: 'write',
      status: 'not_coming',
      army: 'crni',
    })
  })

  it('clear deletes the row', () => {
    expect(decide({ request: 'clear' })).toEqual({ ok: true, op: 'clear' })
  })

  it('a voditelj may clear a past answer', () => {
    expect(decide({ actor: voditelj, request: 'clear', performance: started })).toEqual({
      ok: true,
      op: 'clear',
    })
  })

  it.each([[undefined], ['maybe'], [null], [3]])('rejects the status %s', (request) => {
    expect(decide({ request })).toEqual({
      ok: false,
      status: 400,
      error: ANSWER_ERRORS.unknownStatus,
    })
  })
})

describe('decideAttendanceAnswer — the army', () => {
  it('a moreškant may not choose an army', () => {
    expect(decide({ army: 'crni' })).toEqual({
      ok: false,
      status: 403,
      error: ANSWER_ERRORS.armyNotAllowed,
    })
  })

  it('a voditelj moves a dual-role dancer to the other army', () => {
    const member = dancer({ roles: ['crni', 'bili'], primaryRole: 'crni' })
    expect(decide({ actor: voditelj, member, army: 'bili' })).toEqual({
      ok: true,
      op: 'write',
      status: 'coming',
      army: 'bili',
    })
  })

  it('an army the roles do not cover is refused', () => {
    expect(decide({ actor: voditelj, army: 'bili' })).toEqual({
      ok: false,
      status: 400,
      error: ANSWER_ERRORS.armyNotInRoles,
    })
  })

  it('an unknown army is refused', () => {
    expect(decide({ actor: voditelj, army: 'zeleni' })).toEqual({
      ok: false,
      status: 400,
      error: ANSWER_ERRORS.unknownArmy,
    })
  })

  it('a new row defaults to the primary role army', () => {
    const member = dancer({ roles: ['bili', 'bili_kralj'], primaryRole: 'bili_kralj' })
    expect(decide({ member, actor: voditelj })).toMatchObject({ army: 'bili' })
  })

  it('an existing row keeps the army the voditelj chose', () => {
    const member = dancer({ roles: ['crni', 'bili'], primaryRole: 'crni' })
    expect(decide({ member, hasExisting: true, existingArmy: 'bili' })).toMatchObject({
      army: 'bili',
    })
  })

  it('a bula carries no army', () => {
    const member = dancer({ roles: ['bula'], primaryRole: 'bula' })
    expect(decide({ member, actor: voditelj })).toMatchObject({ army: null })
  })
})
