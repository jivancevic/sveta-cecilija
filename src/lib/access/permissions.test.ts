import { describe, it, expect } from 'vitest'
import { PERMISSIONS, can, hasAny, isPermission, permissionsOf, type Permission } from './permissions'

describe('PERMISSIONS vocabulary', () => {
  it('is the closed eleven-word list from ADR-0023 plus #500, in order', () => {
    expect([...PERMISSIONS]).toEqual([
      'users',
      'tickets',
      'refunds',
      'door',
      'partner',
      'season_stats',
      'moreska',
      'moreskant',
      'finance',
      'editor',
      'dev',
    ])
  })

  it('has no duplicates', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
  })
})

describe('isPermission', () => {
  it('accepts every vocabulary word', () => {
    for (const p of PERMISSIONS) expect(isPermission(p)).toBe(true)
  })

  it('rejects anything else', () => {
    for (const v of ['', 'admin', 'superadmin', 'Users', 'season-stats', 42, null, undefined, {}, ['users']]) {
      expect(isPermission(v)).toBe(false)
    }
  })
})

describe('can', () => {
  // Table: one row per vocabulary word — a user holding exactly that word can
  // do it and nothing else.
  for (const held of PERMISSIONS) {
    it(`grants only '${held}' to a user holding exactly ['${held}']`, () => {
      const user = { permissions: [held] }
      for (const p of PERMISSIONS) {
        expect(can(user, p)).toBe(p === held)
      }
    })
  }

  it('grants everything to a user holding the full set', () => {
    const user = { permissions: [...PERMISSIONS] }
    for (const p of PERMISSIONS) expect(can(user, p)).toBe(true)
  })

  it('denies every permission for an empty set', () => {
    for (const p of PERMISSIONS) expect(can({ permissions: [] }, p)).toBe(false)
  })

  it('denies every permission for a null / undefined user', () => {
    for (const p of PERMISSIONS) {
      expect(can(null, p)).toBe(false)
      expect(can(undefined, p)).toBe(false)
    }
  })

  it('denies when the field is missing or malformed (never "everything")', () => {
    for (const user of [
      {},
      { permissions: null },
      { permissions: undefined },
      { permissions: 'users' },
      { permissions: 42 },
      { permissions: { users: true } },
    ]) {
      for (const p of PERMISSIONS) expect(can(user as { permissions?: unknown }, p)).toBe(false)
    }
  })

  it('ignores an unknown string in the array without crashing', () => {
    const user = { permissions: ['sudo', 'tickets', 'admin'] }
    expect(can(user, 'tickets')).toBe(true)
    expect(can(user, 'users')).toBe(false)
    expect(can(user, 'sudo' as unknown as Permission)).toBe(false)
  })

  it('denies an unknown permission argument even for a full-set user', () => {
    const user = { permissions: [...PERMISSIONS] }
    expect(can(user, 'sudo' as unknown as Permission)).toBe(false)
    expect(can(user, '' as unknown as Permission)).toBe(false)
  })
})

describe('permissionsOf', () => {
  it('drops values outside the vocabulary', () => {
    expect(permissionsOf({ permissions: ['tickets', 'sudo', 'dev', 7, null] })).toEqual(['tickets', 'dev'])
  })

  it('returns an empty array for null user / malformed field', () => {
    expect(permissionsOf(null)).toEqual([])
    expect(permissionsOf({})).toEqual([])
    expect(permissionsOf({ permissions: 'tickets' })).toEqual([])
  })
})

describe('hasAny', () => {
  const user = { permissions: ['tickets', 'refunds'] }

  it('is true when the user holds at least one listed permission', () => {
    expect(hasAny(user, ['tickets'])).toBe(true)
    expect(hasAny(user, ['users', 'refunds'])).toBe(true)
    expect(hasAny(user, ['refunds', 'users'])).toBe(true)
  })

  it('is false when the user holds none of them', () => {
    expect(hasAny(user, ['users'])).toBe(false)
    expect(hasAny(user, ['users', 'door', 'dev'])).toBe(false)
  })

  it('is false for an empty list (never a wildcard)', () => {
    expect(hasAny(user, [])).toBe(false)
    expect(hasAny({ permissions: [...PERMISSIONS] }, [])).toBe(false)
  })

  it('is false for a null user and for an empty set', () => {
    expect(hasAny(null, ['tickets'])).toBe(false)
    expect(hasAny(undefined, ['tickets'])).toBe(false)
    expect(hasAny({ permissions: [] }, ['tickets'])).toBe(false)
  })

  it('ignores unknown strings on both sides', () => {
    expect(hasAny({ permissions: ['sudo'] }, ['sudo' as unknown as Permission])).toBe(false)
    expect(hasAny(user, ['sudo' as unknown as Permission, 'tickets'])).toBe(true)
  })
})
