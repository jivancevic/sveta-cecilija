import { describe, it, expect } from 'vitest'
import { Orders } from './Orders'
import { ContactSubmissions } from './ContactSubmissions'
import { Shows } from './Shows'
import { Tickets } from './Tickets'
import { Users } from './Users'
import { Partners } from './Partners'

const superadmin = { id: '1', role: 'superadmin' }
const admin = { id: '2', role: 'admin' }
const tehnika = { id: '3', role: 'tehnika' }
const partner = { id: '4', role: 'partner', partner: 7 }
const partnerNoLink = { id: '5', role: 'partner' }
const anon = null

function call(fn: unknown, user: unknown): boolean {
  if (typeof fn !== 'function') return true // Payload default
  return Boolean((fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } }))
}

// Returns the raw access result (boolean | Where), not coerced.
function raw(fn: unknown, user: unknown): unknown {
  if (typeof fn !== 'function') return true
  return (fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } })
}

describe('Orders access', () => {
  it('admin-tier (superadmin + admin) can read; tehnika cannot', () => {
    expect(call(Orders.access?.read, superadmin)).toBe(true)
    expect(call(Orders.access?.read, admin)).toBe(true)
    expect(call(Orders.access?.read, tehnika)).toBe(false)
    expect(call(Orders.access?.read, anon)).toBe(false)
  })

  it('a partner reads only its own orders (orders.partner = self)', () => {
    expect(raw(Orders.access?.read, partner)).toEqual({ partner: { equals: 7 } })
  })

  it('a partner with no linked record reads nothing', () => {
    expect(raw(Orders.access?.read, partnerNoLink)).toBe(false)
  })

  it('a partner cannot mutate orders', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(Orders.access?.[op], partner)).toBe(false)
    }
  })

  it('admin-tier can mutate (CRUD); tehnika cannot', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(Orders.access?.[op], superadmin)).toBe(true)
      expect(call(Orders.access?.[op], admin)).toBe(true)
      expect(call(Orders.access?.[op], tehnika)).toBe(false)
    }
  })
})

describe('Partners access', () => {
  it('admin-tier reads all partners', () => {
    expect(call(Partners.access?.read, superadmin)).toBe(true)
    expect(call(Partners.access?.read, admin)).toBe(true)
  })

  it('a partner reads only its own record (partners.id = self)', () => {
    expect(raw(Partners.access?.read, partner)).toEqual({ id: { equals: 7 } })
  })

  it('a partner with no linked record reads nothing; tehnika + anon read nothing', () => {
    expect(raw(Partners.access?.read, partnerNoLink)).toBe(false)
    expect(call(Partners.access?.read, tehnika)).toBe(false)
    expect(call(Partners.access?.read, anon)).toBe(false)
  })

  it('only admin-tier can create/update/delete (set commission); partner + tehnika cannot', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(Partners.access?.[op], superadmin)).toBe(true)
      expect(call(Partners.access?.[op], admin)).toBe(true)
      expect(call(Partners.access?.[op], partner)).toBe(false)
      expect(call(Partners.access?.[op], tehnika)).toBe(false)
      expect(call(Partners.access?.[op], anon)).toBe(false)
    }
  })

  it('commissionPercent defaults to 10 (clamped 0..100)', () => {
    const f = Partners.fields.find(
      (x) => 'name' in x && x.name === 'commissionPercent',
    ) as { defaultValue?: number; min?: number; max?: number } | undefined
    expect(f?.defaultValue).toBe(10)
    expect(f?.min).toBe(0)
    expect(f?.max).toBe(100)
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

  // Note: Users.admin.hidden was intentionally removed in d01ef84 — hiding the
  // collection 404s the top-bar Account link for non-superadmins. Read access is
  // restricted by selfOrSuperadmin and the role field is locked by field-level
  // access (both covered by the tests above), so no sidebar-hiding test belongs here.

  it('role options include partner', () => {
    const roleField = Users.fields.find(
      (f) => 'name' in f && f.name === 'role',
    ) as { options?: { value: string }[] } | undefined
    expect(roleField?.options?.map((o) => o.value)).toContain('partner')
  })

  it('partner link field: write locked to admin-tier, read left open for scoping', () => {
    const partnerField = Users.fields.find(
      (f) => 'name' in f && f.name === 'partner',
    ) as { access?: { read?: unknown; update?: unknown; create?: unknown } } | undefined
    expect(partnerField).toBeDefined()
    // Read intentionally undefined (open) so req.user.partner survives for
    // ownership scoping; a partner could otherwise not be scoped to itself.
    expect(partnerField?.access?.read).toBeUndefined()
    // Write locked: a partner can self-edit its profile, so without this it
    // could repoint itself at another partner and read that partner's data.
    for (const op of ['update', 'create'] as const) {
      expect(call(partnerField?.access?.[op], superadmin)).toBe(true)
      expect(call(partnerField?.access?.[op], admin)).toBe(true)
      expect(call(partnerField?.access?.[op], partner)).toBe(false)
      expect(call(partnerField?.access?.[op], tehnika)).toBe(false)
    }
  })

  it('tokenExpiration is 30 days', () => {
    const auth = Users.auth as { tokenExpiration?: number } | true | undefined
    expect(typeof auth === 'object' && auth?.tokenExpiration).toBe(60 * 60 * 24 * 30)
  })
})

describe('Sidebar visibility (admin.hidden)', () => {
  const callHidden = (cfg: { admin?: { hidden?: unknown } }, user: unknown): boolean => {
    const fn = cfg.admin?.hidden as ((args: { user: unknown }) => boolean) | undefined
    if (typeof fn !== 'function') return false
    return fn({ user })
  }

  it.each([
    ['Orders', Orders],
    ['Shows', Shows],
    ['Tickets', Tickets],
    ['ContactSubmissions', ContactSubmissions],
    ['Partners', Partners],
  ] as const)('%s is visible to admin-tier, hidden from tehnika + partner', (_name, cfg) => {
    expect(callHidden(cfg, superadmin)).toBe(false)
    expect(callHidden(cfg, admin)).toBe(false)
    expect(callHidden(cfg, tehnika)).toBe(true)
    expect(callHidden(cfg, partner)).toBe(true)
    expect(callHidden(cfg, anon)).toBe(true)
  })
})

describe('Tickets access', () => {
  it('all internal staff roles read every ticket (door scanning)', () => {
    expect(call(Tickets.access?.read, superadmin)).toBe(true)
    expect(call(Tickets.access?.read, admin)).toBe(true)
    expect(call(Tickets.access?.read, tehnika)).toBe(true)
    expect(call(Tickets.access?.read, anon)).toBe(false)
  })

  it('a partner reads only tickets under its own orders (via order relationship)', () => {
    expect(raw(Tickets.access?.read, partner)).toEqual({ 'order.partner': { equals: 7 } })
    expect(raw(Tickets.access?.read, partnerNoLink)).toBe(false)
  })

  it('admin-tier can mutate; tehnika + partner cannot', () => {
    for (const op of ['create', 'update', 'delete'] as const) {
      expect(call(Tickets.access?.[op], superadmin)).toBe(true)
      expect(call(Tickets.access?.[op], admin)).toBe(true)
      expect(call(Tickets.access?.[op], tehnika)).toBe(false)
      expect(call(Tickets.access?.[op], partner)).toBe(false)
    }
  })
})
