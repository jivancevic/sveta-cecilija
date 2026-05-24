import { describe, it, expect } from 'vitest'
import { isAdmin, isAuthed } from './roles'

describe('isAdmin', () => {
  it('returns true for users with role admin', () => {
    expect(isAdmin({ role: 'admin' })).toBe(true)
  })

  it('returns false for users with role door-staff', () => {
    expect(isAdmin({ role: 'door-staff' })).toBe(false)
  })

  it('returns false for unauthenticated requests', () => {
    expect(isAdmin(null)).toBe(false)
    expect(isAdmin(undefined)).toBe(false)
  })

  it('returns false for users without a role (defensive)', () => {
    expect(isAdmin({} as { role?: string })).toBe(false)
  })
})

describe('isAuthed', () => {
  it('returns true for admin users', () => {
    expect(isAuthed({ role: 'admin' })).toBe(true)
  })

  it('returns true for door-staff users', () => {
    expect(isAuthed({ role: 'door-staff' })).toBe(true)
  })

  it('returns false for unauthenticated requests', () => {
    expect(isAuthed(null)).toBe(false)
    expect(isAuthed(undefined)).toBe(false)
  })
})
