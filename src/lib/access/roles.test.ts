import { describe, it, expect } from 'vitest'
import { isSuperadmin, isAdminTier, isAuthed, isMember, isPartner } from './roles'

describe('isSuperadmin', () => {
  it('returns true only for role superadmin', () => {
    expect(isSuperadmin({ role: 'superadmin' })).toBe(true)
  })

  it('returns false for admin and tehnika', () => {
    expect(isSuperadmin({ role: 'admin' })).toBe(false)
    expect(isSuperadmin({ role: 'tehnika' })).toBe(false)
  })

  it('returns false for unauthenticated and role-less', () => {
    expect(isSuperadmin(null)).toBe(false)
    expect(isSuperadmin(undefined)).toBe(false)
    expect(isSuperadmin({} as { role?: string })).toBe(false)
  })
})

describe('isAdminTier', () => {
  it('returns true for superadmin and admin', () => {
    expect(isAdminTier({ role: 'superadmin' })).toBe(true)
    expect(isAdminTier({ role: 'admin' })).toBe(true)
  })

  it('returns false for tehnika', () => {
    expect(isAdminTier({ role: 'tehnika' })).toBe(false)
  })

  it('returns false for unauthenticated and role-less', () => {
    expect(isAdminTier(null)).toBe(false)
    expect(isAdminTier(undefined)).toBe(false)
    expect(isAdminTier({} as { role?: string })).toBe(false)
  })
})

describe('isAuthed', () => {
  it('returns true for every defined role', () => {
    expect(isAuthed({ role: 'superadmin' })).toBe(true)
    expect(isAuthed({ role: 'admin' })).toBe(true)
    expect(isAuthed({ role: 'tehnika' })).toBe(true)
  })

  it('returns false for unauthenticated', () => {
    expect(isAuthed(null)).toBe(false)
    expect(isAuthed(undefined)).toBe(false)
  })
})

describe('isMember', () => {
  it('returns true only for the shared society-membership role', () => {
    expect(isMember({ role: 'member' })).toBe(true)
  })

  it('returns false for every other role and for unauthenticated', () => {
    for (const role of ['superadmin', 'admin', 'tehnika', 'partner']) {
      expect(isMember({ role })).toBe(false)
    }
    expect(isMember(null)).toBe(false)
    expect(isMember(undefined)).toBe(false)
    expect(isMember({} as { role?: string })).toBe(false)
  })
})

// ADR-0022: `member` must appear in NO other predicate. Every collection's
// access and admin.hidden is an allow-list built from these, so a role missing
// from all of them is denied everywhere — that is the whole security story for
// the shared login, and this test is what keeps it true.
describe('member is in no other access predicate', () => {
  const member = { role: 'member' }

  it('is not superadmin, not admin-tier, not internal staff, not a partner', () => {
    expect(isSuperadmin(member)).toBe(false)
    expect(isAdminTier(member)).toBe(false)
    expect(isAuthed(member)).toBe(false)
    expect(isPartner(member)).toBe(false)
  })
})
