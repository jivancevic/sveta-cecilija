import { describe, it, expect } from 'vitest'
import { userUpdateAccess } from './user-self-update'

describe('userUpdateAccess', () => {
  it('lets a superadmin update anyone', () => {
    expect(userUpdateAccess({ id: 1, role: 'superadmin' })).toBe(true)
  })

  it.each(['admin', 'tehnika', 'partner'])('scopes a %s to its own record', (role) => {
    expect(userUpdateAccess({ id: 7, role })).toEqual({ id: { equals: 7 } })
  })

  it('denies the shared member account any update, including its own record', () => {
    // The whole membership shares one password (ADR-0022). If a member could
    // edit its own record, any one of them could rotate that password and lock
    // out the entire society AND the developer. Rotation is a superadmin act.
    expect(userUpdateAccess({ id: 7, role: 'member' })).toBe(false)
  })

  it('denies an anonymous request', () => {
    expect(userUpdateAccess(null)).toBe(false)
    expect(userUpdateAccess(undefined)).toBe(false)
  })

  it('denies an authenticated user with no id', () => {
    expect(userUpdateAccess({ role: 'admin' })).toBe(false)
  })
})
