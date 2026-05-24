import { describe, it, expect } from 'vitest'
import { Orders } from './Orders'
import { ContactSubmissions } from './ContactSubmissions'
import { Shows } from './Shows'
import { QRTokens } from './QRTokens'
import { Users } from './Users'

const admin = { id: '1', role: 'admin' }
const doorStaff = { id: '2', role: 'door-staff' }
const anon = null

function call(fn: unknown, user: unknown): boolean {
  if (typeof fn !== 'function') return true // Payload default
  return Boolean((fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } }))
}

describe('Orders access', () => {
  it('only admin can read', () => {
    expect(call(Orders.access?.read, admin)).toBe(true)
    expect(call(Orders.access?.read, doorStaff)).toBe(false)
    expect(call(Orders.access?.read, anon)).toBe(false)
  })

  it('only admin can update (blocks refund mutations)', () => {
    expect(call(Orders.access?.update, admin)).toBe(true)
    expect(call(Orders.access?.update, doorStaff)).toBe(false)
  })

  it('only admin can delete', () => {
    expect(call(Orders.access?.delete, admin)).toBe(true)
    expect(call(Orders.access?.delete, doorStaff)).toBe(false)
  })

  it('only admin can create', () => {
    expect(call(Orders.access?.create, admin)).toBe(true)
    expect(call(Orders.access?.create, doorStaff)).toBe(false)
  })
})

describe('ContactSubmissions access', () => {
  it('only admin can read', () => {
    expect(call(ContactSubmissions.access?.read, admin)).toBe(true)
    expect(call(ContactSubmissions.access?.read, doorStaff)).toBe(false)
  })

  it('only admin can mutate', () => {
    expect(call(ContactSubmissions.access?.update, doorStaff)).toBe(false)
    expect(call(ContactSubmissions.access?.delete, doorStaff)).toBe(false)
    expect(call(ContactSubmissions.access?.create, doorStaff)).toBe(false)
  })
})

describe('Shows access', () => {
  it('admin and door-staff can read (for stats + scanning)', () => {
    expect(call(Shows.access?.read, admin)).toBe(true)
    expect(call(Shows.access?.read, doorStaff)).toBe(true)
    expect(call(Shows.access?.read, anon)).toBe(false)
  })

  it('only admin can mutate', () => {
    expect(call(Shows.access?.update, doorStaff)).toBe(false)
    expect(call(Shows.access?.delete, doorStaff)).toBe(false)
    expect(call(Shows.access?.create, doorStaff)).toBe(false)
    expect(call(Shows.access?.update, admin)).toBe(true)
  })
})

describe('Users access', () => {
  const callWith = (fn: unknown, user: unknown) => {
    if (typeof fn !== 'function') return true
    return (fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } })
  }

  it('admin can read all users (returns true)', () => {
    expect(callWith(Users.access?.read, admin)).toBe(true)
  })

  it('door-staff can only read their own user record (returns id-scoped where)', () => {
    const result = callWith(Users.access?.read, { id: 42, role: 'door-staff' })
    expect(result).toEqual({ id: { equals: 42 } })
  })

  it('anon cannot read users', () => {
    expect(callWith(Users.access?.read, anon)).toBe(false)
  })

  it('only admin can create users', () => {
    expect(call(Users.access?.create, admin)).toBe(true)
    expect(call(Users.access?.create, doorStaff)).toBe(false)
  })

  it('only admin can delete users', () => {
    expect(call(Users.access?.delete, admin)).toBe(true)
    expect(call(Users.access?.delete, doorStaff)).toBe(false)
  })

  it('door-staff can only update their own record; admin can update any', () => {
    expect(callWith(Users.access?.update, admin)).toBe(true)
    expect(callWith(Users.access?.update, { id: 42, role: 'door-staff' })).toEqual({ id: { equals: 42 } })
    expect(callWith(Users.access?.update, anon)).toBe(false)
  })
})

describe('QRTokens access', () => {
  it('admin and door-staff can read', () => {
    expect(call(QRTokens.access?.read, admin)).toBe(true)
    expect(call(QRTokens.access?.read, doorStaff)).toBe(true)
    expect(call(QRTokens.access?.read, anon)).toBe(false)
  })

  it('only admin can mutate', () => {
    expect(call(QRTokens.access?.update, doorStaff)).toBe(false)
    expect(call(QRTokens.access?.delete, doorStaff)).toBe(false)
    expect(call(QRTokens.access?.create, doorStaff)).toBe(false)
  })
})
