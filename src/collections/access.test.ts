import { describe, it, expect } from 'vitest'
import { Orders } from './Orders'
import { ContactSubmissions } from './ContactSubmissions'
import { Shows } from './Shows'
import { QRTokens } from './QRTokens'
import { Users } from './Users'

const superadmin = { id: '1', role: 'superadmin' }
const admin = { id: '2', role: 'admin' }
const tehnika = { id: '3', role: 'tehnika' }
const anon = null

function call(fn: unknown, user: unknown): boolean {
  if (typeof fn !== 'function') return true // Payload default
  return Boolean((fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } }))
}

describe('Orders access', () => {
  it('admin-tier (superadmin + admin) can read; tehnika cannot', () => {
    expect(call(Orders.access?.read, superadmin)).toBe(true)
    expect(call(Orders.access?.read, admin)).toBe(true)
    expect(call(Orders.access?.read, tehnika)).toBe(false)
    expect(call(Orders.access?.read, anon)).toBe(false)
  })

  it('admin-tier can mutate (CRUD); tehnika cannot', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(Orders.access?.[op], superadmin)).toBe(true)
      expect(call(Orders.access?.[op], admin)).toBe(true)
      expect(call(Orders.access?.[op], tehnika)).toBe(false)
    }
  })
})

describe('ContactSubmissions access', () => {
  it('admin-tier can read + mutate; tehnika cannot', () => {
    for (const op of ['read', 'create', 'update', 'delete'] as const) {
      expect(call(ContactSubmissions.access?.[op], superadmin)).toBe(true)
      expect(call(ContactSubmissions.access?.[op], admin)).toBe(true)
      expect(call(ContactSubmissions.access?.[op], tehnika)).toBe(false)
    }
  })
})

describe('Shows access', () => {
  it('all authed roles can read (needed for stats + scanning)', () => {
    expect(call(Shows.access?.read, superadmin)).toBe(true)
    expect(call(Shows.access?.read, admin)).toBe(true)
    expect(call(Shows.access?.read, tehnika)).toBe(true)
    expect(call(Shows.access?.read, anon)).toBe(false)
  })

  it('admin-tier can mutate; tehnika cannot', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(Shows.access?.[op], superadmin)).toBe(true)
      expect(call(Shows.access?.[op], admin)).toBe(true)
      expect(call(Shows.access?.[op], tehnika)).toBe(false)
    }
  })

  it('legacyReserved is admin-tier-only edit (defense-in-depth field-level access)', () => {
    const legacy = Shows.fields.find(
      (f) => 'name' in f && f.name === 'legacyReserved',
    ) as { access?: { update?: unknown } } | undefined
    expect(legacy).toBeDefined()
    const updateAccess = legacy?.access?.update
    expect(call(updateAccess, superadmin)).toBe(true)
    expect(call(updateAccess, admin)).toBe(true)
    expect(call(updateAccess, tehnika)).toBe(false)
    expect(call(updateAccess, anon)).toBe(false)
  })

  it('legacyReserved defaults to 0 with min 0', () => {
    const legacy = Shows.fields.find(
      (f) => 'name' in f && f.name === 'legacyReserved',
    ) as { defaultValue?: number; min?: number } | undefined
    expect(legacy?.defaultValue).toBe(0)
    expect(legacy?.min).toBe(0)
  })
})

describe('Users access', () => {
  const callWith = (fn: unknown, user: unknown) => {
    if (typeof fn !== 'function') return true
    return (fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } })
  }

  it('superadmin reads all; admin + tehnika see only their own row', () => {
    expect(callWith(Users.access?.read, superadmin)).toBe(true)
    expect(callWith(Users.access?.read, { id: 42, role: 'admin' })).toEqual({ id: { equals: 42 } })
    expect(callWith(Users.access?.read, { id: 43, role: 'tehnika' })).toEqual({ id: { equals: 43 } })
    expect(callWith(Users.access?.read, anon)).toBe(false)
  })

  it('only superadmin can create users (admin tier cannot promote / add)', () => {
    expect(call(Users.access?.create, superadmin)).toBe(true)
    expect(call(Users.access?.create, admin)).toBe(false)
    expect(call(Users.access?.create, tehnika)).toBe(false)
  })

  it('only superadmin can delete users', () => {
    expect(call(Users.access?.delete, superadmin)).toBe(true)
    expect(call(Users.access?.delete, admin)).toBe(false)
    expect(call(Users.access?.delete, tehnika)).toBe(false)
  })

  it('superadmin can update any; admin + tehnika can only update self', () => {
    expect(callWith(Users.access?.update, superadmin)).toBe(true)
    expect(callWith(Users.access?.update, { id: 42, role: 'admin' })).toEqual({ id: { equals: 42 } })
    expect(callWith(Users.access?.update, { id: 43, role: 'tehnika' })).toEqual({ id: { equals: 43 } })
    expect(callWith(Users.access?.update, anon)).toBe(false)
  })

  it('role field is locked to superadmin (self-promotion is blocked)', () => {
    const roleField = Users.fields.find(
      (f) => 'name' in f && f.name === 'role',
    ) as { access?: { read?: unknown; update?: unknown; create?: unknown } } | undefined
    expect(roleField?.access).toBeDefined()
    for (const op of ['read', 'update', 'create'] as const) {
      expect(call(roleField?.access?.[op], superadmin)).toBe(true)
      expect(call(roleField?.access?.[op], admin)).toBe(false)
      expect(call(roleField?.access?.[op], tehnika)).toBe(false)
    }
  })

  it('Users collection is hidden from non-superadmin sidebars', () => {
    const hidden = Users.admin?.hidden as ((args: { user: unknown }) => boolean) | undefined
    expect(hidden).toBeTypeOf('function')
    expect(hidden!({ user: superadmin })).toBe(false)
    expect(hidden!({ user: admin })).toBe(true)
    expect(hidden!({ user: tehnika })).toBe(true)
    expect(hidden!({ user: anon })).toBe(true)
  })

  it('tokenExpiration is 30 days', () => {
    const auth = Users.auth as { tokenExpiration?: number } | true | undefined
    expect(typeof auth === 'object' && auth?.tokenExpiration).toBe(60 * 60 * 24 * 30)
  })
})

describe('QRTokens access', () => {
  it('all authed roles can read', () => {
    expect(call(QRTokens.access?.read, superadmin)).toBe(true)
    expect(call(QRTokens.access?.read, admin)).toBe(true)
    expect(call(QRTokens.access?.read, tehnika)).toBe(true)
    expect(call(QRTokens.access?.read, anon)).toBe(false)
  })

  it('admin-tier can mutate; tehnika cannot', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(QRTokens.access?.[op], superadmin)).toBe(true)
      expect(call(QRTokens.access?.[op], admin)).toBe(true)
      expect(call(QRTokens.access?.[op], tehnika)).toBe(false)
    }
  })
})
