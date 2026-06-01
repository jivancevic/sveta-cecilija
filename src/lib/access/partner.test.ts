import { describe, it, expect } from 'vitest'
import { isPartner, partnerIdOf } from './roles'
import {
  partnerOwnOrdersWhere,
  partnerOwnRecordWhere,
  partnerOwnTicketsWhere,
} from './partner'

const partner = { id: 9, role: 'partner', partner: 5 }
const partnerPopulated = { id: 9, role: 'partner', partner: { id: 5, name: 'Kaleta' } }
const partnerNoLink = { id: 9, role: 'partner' }
const admin = { id: 1, role: 'admin' }
const tehnika = { id: 2, role: 'tehnika' }
const anon = null

describe('isPartner', () => {
  it('is true only for the partner role', () => {
    expect(isPartner(partner)).toBe(true)
    expect(isPartner(admin)).toBe(false)
    expect(isPartner(tehnika)).toBe(false)
    expect(isPartner(anon)).toBe(false)
  })
})

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

  it('non-partners get no scope (false) from every helper', () => {
    for (const u of [admin, tehnika, anon]) {
      expect(partnerOwnOrdersWhere(u)).toBe(false)
      expect(partnerOwnRecordWhere(u)).toBe(false)
      expect(partnerOwnTicketsWhere(u)).toBe(false)
    }
  })
})
