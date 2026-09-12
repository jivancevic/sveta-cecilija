import { describe, it, expect } from 'vitest'
import {
  actsAsPartner,
  partnerIdOf,
  partnerOwnOrdersWhere,
  partnerOwnRecordWhere,
  partnerOwnTicketsWhere,
} from './partner'

// Permission-set fixtures, one per migration bundle (#393). The scoping module
// no longer reads a role at all.
const partner = { id: 9, permissions: ['partner'], partner: 5 }
const partnerPopulated = { id: 9, permissions: ['partner'], partner: { id: 5, name: 'Kaleta' } }
const partnerNoLink = { id: 9, permissions: ['partner'] }
const admin = { id: 1, permissions: ['tickets', 'refunds', 'door'] }
const tehnika = { id: 2, permissions: ['door'] }
const member = { id: 3, permissions: ['season_stats'] }
const superadmin = {
  id: 4,
  permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'],
}
// An account with a Partners link but no permission set at all: the point of
// the permission model is that the link alone owns nothing.
const linkedNoPermissions = { id: 5, partner: 5 }
const anon = null

describe('partnerIdOf', () => {
  it('reads a bare id link (depth 0)', () => {
    expect(partnerIdOf(partner)).toBe(5)
  })
  it('reads a populated relationship doc', () => {
    expect(partnerIdOf(partnerPopulated)).toBe(5)
  })
  it('is undefined when there is no link', () => {
    expect(partnerIdOf(partnerNoLink)).toBeUndefined()
    expect(partnerIdOf(admin)).toBeUndefined()
    expect(partnerIdOf(anon)).toBeUndefined()
  })
})

describe('partner ownership Where helpers', () => {
  it('orders scope to orders.partner = self', () => {
    expect(partnerOwnOrdersWhere(partner)).toEqual({ partner: { equals: 5 } })
  })
  it('own-record scopes to partners.id = self', () => {
    expect(partnerOwnRecordWhere(partner)).toEqual({ id: { equals: 5 } })
  })
  it('tickets scope through the order relationship', () => {
    expect(partnerOwnTicketsWhere(partner)).toEqual({ 'order.partner': { equals: 5 } })
  })

  it('fail-safe: a partner with no linked record owns nothing (false, not all)', () => {
    expect(partnerOwnOrdersWhere(partnerNoLink)).toBe(false)
    expect(partnerOwnRecordWhere(partnerNoLink)).toBe(false)
    expect(partnerOwnTicketsWhere(partnerNoLink)).toBe(false)
  })

  // `linkedNoPermissions` carries a Partners link but no permission set: the
  // link alone is never an alias for the `partner` permission.
  it('users without the partner permission get no scope (false) from every helper', () => {
    for (const u of [admin, tehnika, member, linkedNoPermissions, anon]) {
      expect(partnerOwnOrdersWhere(u)).toBe(false)
      expect(partnerOwnRecordWhere(u)).toBe(false)
      expect(partnerOwnTicketsWhere(u)).toBe(false)
    }
  })

  it('the users holder holds `partner` but has no link, so it still scopes to nothing', () => {
    expect(partnerOwnOrdersWhere(superadmin)).toBe(false)
    expect(partnerOwnRecordWhere(superadmin)).toBe(false)
    expect(partnerOwnTicketsWhere(superadmin)).toBe(false)
  })

  it('a malformed permission set is denied, never wildcarded', () => {
    for (const permissions of [undefined, null, 'partner', 42, {}]) {
      expect(partnerOwnOrdersWhere({ permissions, partner: 5 })).toBe(false)
    }
  })
})

describe('actsAsPartner', () => {
  it('is true for a reseller login', () => {
    expect(actsAsPartner(partner)).toBe(true)
    expect(actsAsPartner(partnerNoLink)).toBe(true)
  })

  it('is false for staff, even for the users holder that also holds `partner`', () => {
    expect(actsAsPartner(superadmin)).toBe(false)
    expect(actsAsPartner(admin)).toBe(false)
    expect(actsAsPartner(tehnika)).toBe(false)
    expect(actsAsPartner(member)).toBe(false)
    expect(actsAsPartner(anon)).toBe(false)
  })
})
