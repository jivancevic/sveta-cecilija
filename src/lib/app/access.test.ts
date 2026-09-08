import { describe, expect, it } from 'vitest'
import { accessMember, decideAppAccess, isActiveMoreskant, type AppMember } from './access'
import { PERMISSIONS } from '@/lib/access/permissions'

const dancer = (over: Partial<AppMember> = {}): AppMember => ({
  id: '3',
  name: 'Ivan Fabris',
  nickname: 'Cici',
  roles: ['crni', 'crni_kralj'],
  primaryRole: 'crni_kralj',
  active: true,
  isMoreskant: true,
  ...over,
})

const user = (...permissions: string[]) => ({ id: '1', permissions })

describe('isActiveMoreskant', () => {
  it.each([
    ['a live dancer', dancer(), true],
    ['a retired dancer', dancer({ active: false }), false],
    ['a member who is not a dancer', dancer({ isMoreskant: false }), false],
    ['a plain attribution member', { id: '9', name: 'Ana' }, false],
    ['no member at all', null, false],
    ['undefined', undefined, false],
    // `active` defaults to true in the collection; a row that never got the
    // column (or a NULL) is not retired.
    ['a dancer with no explicit active flag', { id: '3', isMoreskant: true }, true],
  ])('%s → %s', (_label, member, expected) => {
    expect(isActiveMoreskant(member as AppMember | null)).toBe(expected)
  })
})

describe('decideAppAccess — the voditelj', () => {
  it('lets a `moreska` holder in with no Member link (a non-dancing voditelj)', () => {
    expect(decideAppAccess(user('moreska'), null)).toEqual({ kind: 'voditelj', self: null })
  })

  it('lets a `moreska` holder in even when the linked Member is retired', () => {
    expect(decideAppAccess(user('moreska'), dancer({ active: false }))).toEqual({
      kind: 'voditelj',
      self: null,
    })
  })

  it('carries `self` for a voditelj who also holds `moreskant` and has a live Member', () => {
    const me = dancer()
    expect(decideAppAccess(user('moreska', 'moreskant'), me)).toEqual({
      kind: 'voditelj',
      self: me,
    })
  })

  it('leaves `self` null when the voditelj does not hold `moreskant`', () => {
    expect(decideAppAccess(user('moreska'), dancer())).toEqual({ kind: 'voditelj', self: null })
  })

  it('leaves `self` null when the linked Member is no longer a dancer', () => {
    expect(
      decideAppAccess(user('moreska', 'moreskant'), dancer({ isMoreskant: false })),
    ).toEqual({ kind: 'voditelj', self: null })
  })

  it('outranks every other permission the same account happens to hold', () => {
    expect(decideAppAccess(user('tickets', 'refunds', 'door', 'moreska'), null).kind).toBe(
      'voditelj',
    )
  })
})

describe('decideAppAccess — the moreškant', () => {
  it('lets a `moreskant` holder in when the linked Member is a live dancer', () => {
    const me = dancer()
    expect(decideAppAccess(user('moreskant'), me)).toEqual({ kind: 'moreskant', member: me })
  })

  it.each([
    ['there is no Member link', null],
    ['the Member is retired', dancer({ active: false })],
    ['the Member is no longer flagged as a dancer', dancer({ isMoreskant: false })],
    ['the Member is a plain attribution row', { id: '9', name: 'Ana' } as AppMember],
  ])('denies a `moreskant` holder when %s', (_label, member) => {
    expect(decideAppAccess(user('moreskant'), member)).toEqual({ kind: 'denied' })
  })
})

describe('decideAppAccess — everybody else', () => {
  it.each([
    ['anonymous', null],
    ['an authenticated account with no permission set', { id: '2', permissions: undefined }],
    ['tickets (Tatjana)', user('tickets', 'refunds', 'door')],
    ['the door login', user('door')],
    ['a partner POS', user('partner')],
    ['the society season dashboard', user('season_stats')],
    ['a dev-only account', user('dev')],
  ])('denies %s', (_label, u) => {
    expect(decideAppAccess(u, null)).toEqual({ kind: 'denied' })
    // A stray Member link changes nothing without the permission.
    expect(decideAppAccess(u, dancer())).toEqual({ kind: 'denied' })
  })

  it('ignores a permission word outside the vocabulary', () => {
    expect(decideAppAccess(user('voditelj'), dancer())).toEqual({
      kind: 'denied',
    })
  })

  it('never lets a single permission other than moreska/moreskant in (sweep)', () => {
    for (const p of PERMISSIONS) {
      const expected = p === 'moreska' || p === 'moreskant' ? true : false
      expect(decideAppAccess(user(p), dancer()).kind !== 'denied', `permission ${p}`).toBe(expected)
    }
  })
})

describe('accessMember', () => {
  it('is the voditelj’s own row, the moreškant’s row, or nothing', () => {
    const me = dancer()
    expect(accessMember({ kind: 'voditelj', self: me })).toBe(me)
    expect(accessMember({ kind: 'voditelj', self: null })).toBeNull()
    expect(accessMember({ kind: 'moreskant', member: me })).toBe(me)
    expect(accessMember({ kind: 'denied' })).toBeNull()
  })
})
