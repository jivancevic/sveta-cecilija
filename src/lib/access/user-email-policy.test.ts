import { describe, it, expect } from 'vitest'
import {
  emailRequiredFor,
  assertUserEmailPolicy,
  UserEmailRequiredError,
} from './user-email-policy'

describe('emailRequiredFor', () => {
  it('requires email for accounts a named person holds', () => {
    expect(emailRequiredFor({ permissions: ['users', 'tickets', 'dev'] })).toBe(true)
    expect(emailRequiredFor({ permissions: ['tickets', 'refunds', 'door'] })).toBe(true)
    expect(emailRequiredFor({ permissions: ['moreska'] })).toBe(true)
    // A voditelj who also dances is still a voditelj: the wider permission is
    // what decides, not the narrower one beside it.
    expect(emailRequiredFor({ permissions: ['moreska', 'moreskant'] })).toBe(true)
  })

  it('does not require email for shared or external accounts', () => {
    expect(emailRequiredFor({ permissions: ['door'] })).toBe(false)
    expect(emailRequiredFor({ permissions: ['partner'] })).toBe(false)
    expect(emailRequiredFor({ permissions: ['season_stats'] })).toBe(false)
  })

  // #420 → #463: a dancer's login needed an inbox while the invitation WAS an
  // e-mail. It is a link now, handed over by SMS or claimed from the rehearsal
  // QR, so the requirement was refusing a login to seventy-five of the
  // seventy-six moreškanti on the roster and protecting nothing.
  it('does not require email for a plain moreškant login', () => {
    expect(emailRequiredFor({ permissions: ['moreskant'] })).toBe(false)
  })

  it('does not require email for an empty, missing or unknown set', () => {
    expect(emailRequiredFor({ permissions: [] })).toBe(false)
    expect(emailRequiredFor({})).toBe(false)
    expect(emailRequiredFor(null)).toBe(false)
    expect(emailRequiredFor({ permissions: ['admin'] })).toBe(false)
  })
})

describe('assertUserEmailPolicy', () => {
  it('rejects a person-tier account with no email', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['users'], email: null })).toThrow(
      UserEmailRequiredError,
    )
    expect(() => assertUserEmailPolicy({ permissions: ['tickets'], email: '' })).toThrow(
      UserEmailRequiredError,
    )
    expect(() => assertUserEmailPolicy({ permissions: ['moreska'], email: '   ' })).toThrow(
      /email address is required/i,
    )
  })

  it('accepts a moreškant login with no email (#463)', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['moreskant'], email: null })).not.toThrow()
  })

  it('accepts a person-tier account with an email', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['tickets'], email: 'a@b.co' })).not.toThrow()
  })

  it('accepts a door/partner/member account with no email (username-only)', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['door'], email: null })).not.toThrow()
    expect(() => assertUserEmailPolicy({ permissions: ['partner'], email: undefined })).not.toThrow()
    expect(() => assertUserEmailPolicy({ permissions: ['season_stats'] })).not.toThrow()
  })

  it('names the offending permissions in the message', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['tickets', 'door'] })).toThrow(/tickets/)
  })

  // #500: both new permissions belong to a named person, never a shared login.
  it('requires an email for a finance holder', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['finance'], email: null })).toThrow(
      /finance/,
    )
  })

  it('requires an email for an editor', () => {
    expect(() => assertUserEmailPolicy({ permissions: ['editor'] })).toThrow(/editor/)
  })

  it('accepts a finance holder with an email', () => {
    expect(() =>
      assertUserEmailPolicy({ permissions: ['finance', 'door'], email: 'vele@moreska.eu' }),
    ).not.toThrow()
  })
})
