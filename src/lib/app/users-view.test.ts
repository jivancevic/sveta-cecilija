import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'
import {
  displayName,
  emailLabel,
  filterAccounts,
  permissionChips,
  permissionPills,
  sortAccounts,
  type UserAccount,
} from './users-view'

const S = APP_STRINGS.users

function account(over: Partial<UserAccount> = {}): UserAccount {
  return {
    id: '1',
    username: 'ttvigna',
    name: 'Tatjana Vigna',
    email: 'tatjana@moreska.eu',
    permissions: ['tickets', 'refunds'],
    shared: false,
    tabs: [],
    partnerId: null,
    partnerName: null,
    memberId: null,
    memberName: null,
    ...over,
  }
}

describe('permissionChips', () => {
  it('reads the set in the vocabulary’s own order, whatever order it was stored in', () => {
    expect(permissionChips(['refunds', 'tickets']).map((c) => c.key)).toEqual([
      'tickets',
      'refunds',
    ])
  })

  it('has a Croatian word for every permission there is', () => {
    const chips = permissionChips([...PERMISSIONS])
    expect(chips).toHaveLength(PERMISSIONS.length)
    for (const chip of chips) expect(chip.label.length).toBeGreaterThan(0)
  })

  it('says so when an account holds nothing', () => {
    expect(permissionChips([])).toEqual([])
  })
})

describe('emailLabel', () => {
  it('prints the address when there is one', () => {
    expect(emailLabel('ana@moreska.eu')).toBe('ana@moreska.eu')
  })

  it('names the absence rather than printing a blank', () => {
    expect(emailLabel(null)).toBe(S.noEmail)
    expect(emailLabel('  ')).toBe(S.noEmail)
  })
})

describe('displayName', () => {
  it('prefers the name on the account', () => {
    expect(displayName(account())).toBe('Tatjana Vigna')
  })

  it('falls back to the linked member, which is where a dancer’s name lives', () => {
    expect(displayName(account({ name: null, memberName: 'Luka Brkić' }))).toBe('Luka Brkić')
  })

  it('falls back to the partner for a reseller POS login', () => {
    expect(displayName(account({ name: null, partnerName: 'Kaleta' }))).toBe('Kaleta')
  })

  it('is empty when the row is only a username', () => {
    expect(displayName(account({ name: null }))).toBe('')
  })
})

describe('filterAccounts', () => {
  const rows = [
    account({ id: '1', username: 'ttvigna', name: 'Tatjana Vigna', email: 'tatjana@moreska.eu' }),
    account({ id: '2', username: 'tehnika', name: null, email: null }),
    account({ id: '3', username: 'lbrkic', name: null, email: null, memberName: 'Luka Brkić' }),
  ]

  it('is the whole list when nothing is typed', () => {
    expect(filterAccounts(rows, '')).toHaveLength(3)
    expect(filterAccounts(rows, '   ')).toHaveLength(3)
  })

  it('matches a username', () => {
    expect(filterAccounts(rows, 'tehn').map((r) => r.id)).toEqual(['2'])
  })

  it('matches an address', () => {
    expect(filterAccounts(rows, 'tatjana@').map((r) => r.id)).toEqual(['1'])
  })

  it('matches the name, ignoring case and Croatian diacritics', () => {
    // Typed on a phone keyboard without the Croatian letters, which is how the
    // secretary actually types "Brkić".
    expect(filterAccounts(rows, 'brkic').map((r) => r.id)).toEqual(['3'])
    expect(filterAccounts(rows, 'VIGNA').map((r) => r.id)).toEqual(['1'])
  })

  it('finds nothing rather than everything when nothing matches', () => {
    expect(filterAccounts(rows, 'zzz')).toEqual([])
  })
})

describe('sortAccounts', () => {
  it('is alphabetical by username, the one thing every row has', () => {
    const sorted = sortAccounts([
      account({ id: '1', username: 'vele' }),
      account({ id: '2', username: 'ana' }),
      account({ id: '3', username: 'tehnika' }),
    ])
    expect(sorted.map((r) => r.username)).toEqual(['ana', 'tehnika', 'vele'])
  })

  it('does not mutate what it was handed', () => {
    const rows = [account({ username: 'vele' }), account({ username: 'ana' })]
    sortAccounts(rows)
    expect(rows[0].username).toBe('vele')
  })
})

// The row's pills (#573): three of them and a count of what did not fit.

describe('permissionPills', () => {
  it('shows the first three in the vocabulary order and counts the rest', () => {
    const { pills, extra } = permissionPills(['dev', 'tickets', 'refunds', 'door', 'users'])
    expect(pills.map((p) => p.key)).toEqual(['users', 'tickets', 'refunds'])
    expect(extra).toBe(2)
  })

  it('counts nothing when the whole set fits', () => {
    const { pills, extra } = permissionPills(['tickets'])
    expect(pills).toHaveLength(1)
    expect(extra).toBe(0)
  })

  it('is empty for an account that reaches nothing', () => {
    expect(permissionPills([])).toEqual({ pills: [], extra: 0 })
  })
})
