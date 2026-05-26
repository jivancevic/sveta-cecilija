import { describe, it, expect } from 'vitest'
import { isSuperadmin, isAdminTier, isAuthed } from './roles'

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
