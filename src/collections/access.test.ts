import { describe, it, expect } from 'vitest'
import { Orders } from './Orders'
import { ContactSubmissions } from './ContactSubmissions'
import { Shows } from './Shows'
import { Tickets } from './Tickets'
import { Users, showPartnerLinkField } from './Users'
import { Partners } from './Partners'
import { PromoCodes } from './PromoCodes'
import { Members } from './Members'
import { OrderLookups } from './OrderLookups'
import { Faqs } from './Faqs'
import { Posts } from './Posts'

// Permission-set fixtures, one per migration bundle (#393, ADR-0023). Every
// access decision below reads `permissions`; `noPermissions` is the control
// that proves an authenticated session with no set opens nothing.
const developer = {
  id: '1',
  permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'],
}
const ticketAdmin = { id: '2', permissions: ['tickets', 'refunds', 'door'] }
const doorAccount = { id: '3', permissions: ['door'], shared: true }
const partner = { id: '4', permissions: ['partner'], partner: 7 }
const partnerNoLink = { id: '5', permissions: ['partner'] }
const memberAccount = { id: '6', permissions: ['season_stats'], shared: true }
const voditelj = { id: '7', permissions: ['moreska'] }
const noPermissions = { id: '8' }
const anon = null

// Every account that is NOT the ticketing backoffice. Used to assert the
// backoffice collections are shut to all of them in one sweep.
const outsiders = [
  ['door', doorAccount],
  ['partner', partner],
  ['partner without a link', partnerNoLink],
  ['member', memberAccount],
  ['voditelj', voditelj],
  ['no permission set', noPermissions],
  ['anonymous', anon],
] as const

function call(fn: unknown, user: unknown): boolean {
  if (typeof fn !== 'function') return true // Payload default
  return Boolean((fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } }))
}

// Returns the raw access result (boolean | Where), not coerced.
function raw(fn: unknown, user: unknown): unknown {
  if (typeof fn !== 'function') return true
  return (fn as (args: { req: { user: unknown } }) => unknown)({ req: { user } })
}

function hidden(cfg: { admin?: { hidden?: unknown } }, user: unknown): boolean {
  const fn = cfg.admin?.hidden as ((args: { user: unknown }) => boolean) | undefined
  if (typeof fn !== 'function') return false
  return fn({ user })
}

const CRUD = ['create', 'update', 'delete'] as const

// ---------------------------------------------------------------------------
// The pure-backoffice collections: `tickets` and nobody else, on every verb.
// ---------------------------------------------------------------------------
describe.each([
  ['ContactSubmissions', ContactSubmissions],
  ['PromoCodes', PromoCodes],
  ['Members', Members],
  ['OrderLookups', OrderLookups],
] as const)('%s access', (_name, cfg) => {
  it('a `tickets` holder reads and mutates', () => {
    for (const op of ['read', ...CRUD] as const) {
      expect(call(cfg.access?.[op], ticketAdmin)).toBe(true)
      expect(call(cfg.access?.[op], developer)).toBe(true)
    }
  })

  it.each(outsiders)('%s can neither read nor mutate', (_label, user) => {
    for (const op of ['read', ...CRUD] as const) {
      expect(call(cfg.access?.[op], user)).toBe(false)
    }
  })

  it('is in the sidebar for the backoffice only', () => {
    expect(hidden(cfg, ticketAdmin)).toBe(false)
    expect(hidden(cfg, developer)).toBe(false)
    for (const [, user] of outsiders) expect(hidden(cfg, user)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The two public-content collections: anyone reads the published rows; only
// `tickets` sees drafts and writes.
// ---------------------------------------------------------------------------
describe.each([
  ['Faqs', Faqs],
  ['Posts', Posts],
] as const)('%s access', (_name, cfg) => {
  it('the backoffice reads everything, drafts included (true, no filter)', () => {
    expect(raw(cfg.access?.read, ticketAdmin)).toBe(true)
    expect(raw(cfg.access?.read, developer)).toBe(true)
  })

  it.each(outsiders)('%s reads as a public visitor does (published-only filter)', (_label, user) => {
    const result = raw(cfg.access?.read, user)
    expect(typeof result).toBe('object')
    expect(JSON.stringify(result)).toContain('published')
  })

  it('only the backoffice can create/update/delete', () => {
    for (const op of CRUD) {
      expect(call(cfg.access?.[op], ticketAdmin)).toBe(true)
      expect(call(cfg.access?.[op], developer)).toBe(true)
      for (const [, user] of outsiders) expect(call(cfg.access?.[op], user)).toBe(false)
    }
  })

  it('is in the sidebar for the backoffice only', () => {
    expect(hidden(cfg, ticketAdmin)).toBe(false)
    for (const [, user] of outsiders) expect(hidden(cfg, user)).toBe(true)
  })
})

// Scheduled posts must not leak: the public read filter is published-only AND
// dated in the past. This is the Posts-only half of the shared filter asserted
// above (Faqs has no publishedAt).
describe('Posts public read filter', () => {
  it.each(outsiders)('%s never sees a post dated in the future', (_label, user) => {
    const result = raw(Posts.access?.read, user) as { and: Array<Record<string, unknown>> }
    expect(result.and).toEqual(
      expect.arrayContaining([{ status: { equals: 'published' } }]),
    )
    const dated = result.and.find((f) => 'publishedAt' in f) as
      | { publishedAt: { less_than_equal: string } }
      | undefined
    expect(dated).toBeDefined()
    // The filter snapshots "now" at access time; verify the shape.
    expect(dated!.publishedAt.less_than_equal).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('Orders access', () => {
  it('a `tickets` holder reads every order; a door account does not', () => {
    expect(call(Orders.access?.read, developer)).toBe(true)
    expect(call(Orders.access?.read, ticketAdmin)).toBe(true)
    // Door lookups go through the audited /api/orders/lookup route, not this.
    expect(call(Orders.access?.read, doorAccount)).toBe(false)
    expect(call(Orders.access?.read, memberAccount)).toBe(false)
    expect(call(Orders.access?.read, noPermissions)).toBe(false)
    expect(call(Orders.access?.read, anon)).toBe(false)
  })

  it('a partner reads only its own orders (orders.partner = self)', () => {
    expect(raw(Orders.access?.read, partner)).toEqual({ partner: { equals: 7 } })
  })

  it('a partner with no linked record reads nothing', () => {
    expect(raw(Orders.access?.read, partnerNoLink)).toBe(false)
  })

  it('only a `tickets` holder can mutate', () => {
    for (const op of CRUD) {
      expect(call(Orders.access?.[op], developer)).toBe(true)
      expect(call(Orders.access?.[op], ticketAdmin)).toBe(true)
      for (const [, user] of outsiders) expect(call(Orders.access?.[op], user)).toBe(false)
    }
  })

  it('is in the sidebar for the backoffice only', () => {
    expect(hidden(Orders, ticketAdmin)).toBe(false)
    for (const [, user] of outsiders) expect(hidden(Orders, user)).toBe(true)
  })
})

describe('Partners access', () => {
  it('the backoffice reads all partners', () => {
    expect(call(Partners.access?.read, developer)).toBe(true)
    expect(call(Partners.access?.read, ticketAdmin)).toBe(true)
  })

  it('a partner reads only its own record (partners.id = self)', () => {
    expect(raw(Partners.access?.read, partner)).toEqual({ id: { equals: 7 } })
  })

  it('a partner with no linked record reads nothing; door + member + anon read nothing', () => {
    expect(raw(Partners.access?.read, partnerNoLink)).toBe(false)
    expect(call(Partners.access?.read, doorAccount)).toBe(false)
    expect(call(Partners.access?.read, memberAccount)).toBe(false)
    expect(call(Partners.access?.read, anon)).toBe(false)
  })

  it('only the backoffice can create/update/delete (set commission)', () => {
    for (const op of CRUD) {
      expect(call(Partners.access?.[op], developer)).toBe(true)
      expect(call(Partners.access?.[op], ticketAdmin)).toBe(true)
      for (const [, user] of outsiders) expect(call(Partners.access?.[op], user)).toBe(false)
    }
  })

  it('is in the sidebar for the backoffice only', () => {
    expect(hidden(Partners, ticketAdmin)).toBe(false)
    for (const [, user] of outsiders) expect(hidden(Partners, user)).toBe(true)
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

describe('PromoCodes fields', () => {
  it('code is a unique, required text field', () => {
    const f = PromoCodes.fields.find(
      (x) => 'name' in x && x.name === 'code',
    ) as { type?: string; unique?: boolean; required?: boolean } | undefined
    expect(f?.type).toBe('text')
    expect(f?.unique).toBe(true)
    expect(f?.required).toBe(true)
  })

  it('member is a required relationship to members', () => {
    const f = PromoCodes.fields.find(
      (x) => 'name' in x && x.name === 'member',
    ) as { type?: string; relationTo?: string; required?: boolean } | undefined
    expect(f?.type).toBe('relationship')
    expect(f?.relationTo).toBe('members')
    expect(f?.required).toBe(true)
  })

  it('discountType select has exactly the one v1 value (adult-price-override)', () => {
    const f = PromoCodes.fields.find(
      (x) => 'name' in x && x.name === 'discountType',
    ) as { type?: string; defaultValue?: string; options?: { value: string }[] } | undefined
    expect(f?.type).toBe('select')
    expect(f?.defaultValue).toBe('adult-price-override')
    expect(f?.options?.map((o) => o.value)).toEqual(['adult-price-override'])
  })

  it('adultPriceEur defaults to 15 (min 0)', () => {
    const f = PromoCodes.fields.find(
      (x) => 'name' in x && x.name === 'adultPriceEur',
    ) as { defaultValue?: number; min?: number } | undefined
    expect(f?.defaultValue).toBe(15)
    expect(f?.min).toBe(0)
  })

  it('active defaults to true', () => {
    const f = PromoCodes.fields.find(
      (x) => 'name' in x && x.name === 'active',
    ) as { type?: string; defaultValue?: boolean } | undefined
    expect(f?.type).toBe('checkbox')
    expect(f?.defaultValue).toBe(true)
  })
})

describe('Shows access', () => {
  // The full phase-2 matrix (ADR-0024, #408) lives in
  // src/lib/access/shows-access.test.ts; this block checks the wiring.
  it('the backoffice and the voditelj read every performance', () => {
    expect(raw(Shows.access?.read, developer)).toBe(true)
    expect(raw(Shows.access?.read, ticketAdmin)).toBe(true)
    expect(raw(Shows.access?.read, voditelj)).toBe(true)
  })

  it('the door reads public performances only (a Where, so findByID is covered too)', () => {
    expect(raw(Shows.access?.read, doorAccount)).toEqual({ isPublic: { equals: true } })
  })

  it('a partner, the member login, an empty session and anon do not read', () => {
    expect(call(Shows.access?.read, partner)).toBe(false)
    expect(call(Shows.access?.read, memberAccount)).toBe(false)
    expect(call(Shows.access?.read, noPermissions)).toBe(false)
    expect(call(Shows.access?.read, anon)).toBe(false)
  })

  it('a voditelj creates and deletes non-public performances only', () => {
    expect(raw(Shows.access?.create, voditelj)).toEqual({ isPublic: { equals: false } })
    expect(raw(Shows.access?.delete, voditelj)).toEqual({ isPublic: { equals: false } })
    // Update reaches every row: the roster note and thresholds belong on public
    // shows too. The field-level locks below decide what may change there.
    expect(raw(Shows.access?.update, voditelj)).toBe(true)
  })

  it('the backoffice mutates without a filter; the door and outsiders never write', () => {
    for (const op of CRUD) {
      expect(raw(Shows.access?.[op], developer)).toBe(true)
      expect(raw(Shows.access?.[op], ticketAdmin)).toBe(true)
      expect(call(Shows.access?.[op], doorAccount)).toBe(false)
      expect(call(Shows.access?.[op], partner)).toBe(false)
      expect(call(Shows.access?.[op], memberAccount)).toBe(false)
      expect(call(Shows.access?.[op], noPermissions)).toBe(false)
      expect(call(Shows.access?.[op], anon)).toBe(false)
    }
  })

  it('is in the sidebar for the backoffice and the voditelj, nobody else', () => {
    expect(hidden(Shows, ticketAdmin)).toBe(false)
    expect(hidden(Shows, voditelj)).toBe(false)
    expect(hidden(Shows, doorAccount)).toBe(true)
    for (const [label, user] of outsiders) {
      if (label === 'voditelj') continue
      expect(hidden(Shows, user)).toBe(true)
    }
  })

  it('legacyReserved is backoffice-only edit (defense-in-depth field-level access)', () => {
    const legacy = Shows.fields.find(
      (f) => 'name' in f && f.name === 'legacyReserved',
    ) as { access?: { update?: unknown } } | undefined
    expect(legacy).toBeDefined()
    const updateAccess = legacy?.access?.update
    expect(call(updateAccess, developer)).toBe(true)
    expect(call(updateAccess, ticketAdmin)).toBe(true)
    expect(call(updateAccess, doorAccount)).toBe(false)
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

describe('Tickets access', () => {
  it('the backoffice and the door read every ticket (door scanning)', () => {
    expect(call(Tickets.access?.read, developer)).toBe(true)
    expect(call(Tickets.access?.read, ticketAdmin)).toBe(true)
    expect(call(Tickets.access?.read, doorAccount)).toBe(true)
    expect(call(Tickets.access?.read, memberAccount)).toBe(false)
    expect(call(Tickets.access?.read, noPermissions)).toBe(false)
    expect(call(Tickets.access?.read, anon)).toBe(false)
  })

  it('a partner reads only tickets under its own orders (via order relationship)', () => {
    expect(raw(Tickets.access?.read, partner)).toEqual({ 'order.partner': { equals: 7 } })
    expect(raw(Tickets.access?.read, partnerNoLink)).toBe(false)
  })

  it('only the backoffice can mutate', () => {
    for (const op of CRUD) {
      expect(call(Tickets.access?.[op], developer)).toBe(true)
      expect(call(Tickets.access?.[op], ticketAdmin)).toBe(true)
      for (const [, user] of outsiders) expect(call(Tickets.access?.[op], user)).toBe(false)
    }
  })

  it('is in the sidebar for the backoffice only', () => {
    expect(hidden(Tickets, ticketAdmin)).toBe(false)
    for (const [, user] of outsiders) expect(hidden(Tickets, user)).toBe(true)
  })
})

describe('Users access', () => {
  const usersFieldOf = (name: string) =>
    Users.fields.find((f) => 'name' in f && f.name === name) as
      | {
          type?: string
          required?: boolean
          hasMany?: boolean
          defaultValue?: unknown
          options?: { value: string }[]
          admin?: { hidden?: unknown }
          access?: { read?: unknown; update?: unknown; create?: unknown }
        }
      | undefined

  it('a `users` holder reads everyone; everybody else sees only their own row', () => {
    expect(raw(Users.access?.read, developer)).toBe(true)
    expect(raw(Users.access?.read, ticketAdmin)).toEqual({ id: { equals: '2' } })
    expect(raw(Users.access?.read, doorAccount)).toEqual({ id: { equals: '3' } })
    expect(raw(Users.access?.read, partner)).toEqual({ id: { equals: '4' } })
    expect(raw(Users.access?.read, memberAccount)).toEqual({ id: { equals: '6' } })
    expect(raw(Users.access?.read, anon)).toBe(false)
  })

  it('only a `users` holder can create or delete accounts', () => {
    for (const op of ['create', 'delete'] as const) {
      expect(call(Users.access?.[op], developer)).toBe(true)
      expect(call(Users.access?.[op], ticketAdmin)).toBe(false)
      expect(call(Users.access?.[op], doorAccount)).toBe(false)
      expect(call(Users.access?.[op], noPermissions)).toBe(false)
      expect(call(Users.access?.[op], anon)).toBe(false)
    }
  })

  it('a `users` holder updates anyone; a personal account updates itself; a shared one updates nobody', () => {
    expect(raw(Users.access?.update, developer)).toBe(true)
    expect(raw(Users.access?.update, ticketAdmin)).toEqual({ id: { equals: '2' } })
    expect(raw(Users.access?.update, partner)).toEqual({ id: { equals: '4' } })
    // The door and the society login are shared: no self-edit, so one holder
    // cannot rotate the password on everyone else (ADR-0022).
    expect(raw(Users.access?.update, doorAccount)).toBe(false)
    expect(raw(Users.access?.update, memberAccount)).toBe(false)
    expect(raw(Users.access?.update, anon)).toBe(false)
  })

  it('Users sidebar is visible only to a `users` holder', () => {
    expect(hidden(Users, developer)).toBe(false)
    expect(hidden(Users, ticketAdmin)).toBe(true)
    expect(hidden(Users, doorAccount)).toBe(true)
    expect(hidden(Users, partner)).toBe(true)
    expect(hidden(Users, memberAccount)).toBe(true)
    expect(hidden(Users, noPermissions)).toBe(true)
    expect(hidden(Users, anon)).toBe(true)
  })

  // #398: the legacy tier column is gone from the collection and the database.
  it('has no `role` field any more', () => {
    expect(usersFieldOf('role')).toBeUndefined()
  })

  it('partner link field: write locked to a `users` holder, read left open for scoping', () => {
    const partnerField = usersFieldOf('partner')
    expect(partnerField).toBeDefined()
    // Read intentionally undefined (open) so req.user.partner survives for
    // ownership scoping; a partner could otherwise not be scoped to itself.
    expect(partnerField?.access?.read).toBeUndefined()
    // Write locked: repointing a login at another partner is account
    // administration, not backoffice work (#393).
    for (const op of ['update', 'create'] as const) {
      expect(call(partnerField?.access?.[op], developer)).toBe(true)
      expect(call(partnerField?.access?.[op], ticketAdmin)).toBe(false)
      expect(call(partnerField?.access?.[op], partner)).toBe(false)
      expect(call(partnerField?.access?.[op], doorAccount)).toBe(false)
    }
  })

  it('the partner link field shows for a `partner` holder', () => {
    expect(showPartnerLinkField({ permissions: ['partner'] })).toBe(true)
    expect(showPartnerLinkField({ permissions: ['tickets', 'partner'] })).toBe(true)
  })

  it('the partner link field is hidden for every other account', () => {
    expect(showPartnerLinkField({ permissions: ['tickets', 'refunds', 'door'] })).toBe(false)
    expect(showPartnerLinkField({ permissions: ['season_stats'] })).toBe(false)
    expect(showPartnerLinkField({ permissions: [] })).toBe(false)
    expect(showPartnerLinkField({ permissions: 'partner' })).toBe(false)
    expect(showPartnerLinkField({})).toBe(false)
    expect(showPartnerLinkField()).toBe(false)
  })

  it('permissions field is a required multi-select over the nine-word vocabulary, with no default', () => {
    const field = usersFieldOf('permissions')
    expect(field).toBeDefined()
    expect(field?.type).toBe('select')
    expect(field?.hasMany).toBe(true)
    expect(field?.required).toBe(true)
    expect(field?.defaultValue).toBeUndefined()
    expect(field?.options?.map((o) => o.value)).toEqual([
      'users',
      'tickets',
      'refunds',
      'door',
      'partner',
      'season_stats',
      'moreska',
      'moreskant',
      'dev',
    ])
  })

  it('permissions field read/update/create are locked to `users` holders', () => {
    const access = usersFieldOf('permissions')?.access
    expect(access).toBeDefined()
    for (const op of ['read', 'update', 'create'] as const) {
      expect(call(access?.[op], developer)).toBe(true)
      expect(call(access?.[op], ticketAdmin)).toBe(false)
      expect(call(access?.[op], doorAccount)).toBe(false)
      expect(call(access?.[op], partner)).toBe(false)
      expect(call(access?.[op], memberAccount)).toBe(false)
      expect(call(access?.[op], anon)).toBe(false)
      // An authenticated session with no permission set opens nothing.
      expect(call(access?.[op], noPermissions)).toBe(false)
    }
  })

  it('shared checkbox defaults to false and is locked to `users` holders', () => {
    const field = usersFieldOf('shared')
    expect(field?.type).toBe('checkbox')
    expect(field?.defaultValue).toBe(false)
    for (const op of ['read', 'update', 'create'] as const) {
      expect(call(field?.access?.[op], developer)).toBe(true)
      expect(call(field?.access?.[op], ticketAdmin)).toBe(false)
      expect(call(field?.access?.[op], doorAccount)).toBe(false)
      expect(call(field?.access?.[op], memberAccount)).toBe(false)
      expect(call(field?.access?.[op], anon)).toBe(false)
    }
  })

  it('tokenExpiration is 30 days', () => {
    const auth = Users.auth as { tokenExpiration?: number } | true | undefined
    expect(typeof auth === 'object' && auth?.tokenExpiration).toBe(60 * 60 * 24 * 30)
  })
})
