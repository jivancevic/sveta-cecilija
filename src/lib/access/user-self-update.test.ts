import { describe, it, expect } from 'vitest'
import { userUpdateAccess } from './user-self-update'

describe('userUpdateAccess', () => {
  it('lets a `users` holder update anyone', () => {
    expect(userUpdateAccess({ id: 1, permissions: ['users', 'tickets'] })).toBe(true)
    // Even a shared account would be allowed if it somehow held `users` — the
    // permission is the administrative one, and no such account exists.
    expect(userUpdateAccess({ id: 1, permissions: ['users'], shared: true })).toBe(true)
  })

  it.each([
    ['ticket admin', ['tickets', 'refunds', 'door']],
    ['partner', ['partner']],
    ['voditelj', ['moreska']],
    ['no permissions', []],
  ])('scopes a personal %s account to its own record', (_label, permissions) => {
    expect(userUpdateAccess({ id: 7, permissions })).toEqual({ id: { equals: 7 } })
  })

  it('denies a shared account any update, including its own record', () => {
    // The whole membership shares one password (ADR-0022); the door volunteers
    // share the tehnika one. If either could edit its own record, any single
    // holder could rotate that password and lock out everyone else AND the
    // developer. Rotation is a `users`-holder act.
    expect(userUpdateAccess({ id: 7, permissions: ['season_stats'], shared: true })).toBe(false)
    expect(userUpdateAccess({ id: 8, permissions: ['door'], shared: true })).toBe(false)
  })

  it('treats a non-shared door account as an ordinary self-editor', () => {
    expect(userUpdateAccess({ id: 8, permissions: ['door'] })).toEqual({ id: { equals: 8 } })
  })

  it('denies an anonymous request', () => {
    expect(userUpdateAccess(null)).toBe(false)
    expect(userUpdateAccess(undefined)).toBe(false)
  })

  it('denies an authenticated user with no id', () => {
    expect(userUpdateAccess({ permissions: ['tickets'] })).toBe(false)
  })

  it('scopes a user with no permission set to their own record', () => {
    expect(userUpdateAccess({ id: 1 })).toEqual({ id: { equals: 1 } })
  })
})
