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

const screenKeys = (access: ReturnType<typeof decideAppAccess>) =>
  access.kind === 'ok' ? access.screens.map((s) => s.key) : null

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

// The rule (#473): an account is IN when its permission set unlocks at least
// one screen. Which screens those are is the table's business (screens.ts);
// this file tests the door and what it hands the caller.

describe('decideAppAccess — the voditelj', () => {
  it('lets a `moreska` holder in with no Member link (a non-dancing voditelj)', () => {
    const access = decideAppAccess(user('moreska'), null)
    expect(access.kind).toBe('ok')
    expect(screenKeys(access)).toEqual(['performances', 'leaderboard'])
    expect(access.kind === 'ok' && access.self).toBeNull()
  })

  it('lets a `moreska` holder in even when the linked Member is retired', () => {
    const access = decideAppAccess(user('moreska'), dancer({ active: false }))
    expect(access.kind).toBe('ok')
    expect(access.kind === 'ok' && access.self).toBeNull()
  })

  it('carries `self` for a voditelj who also holds `moreskant` and has a live Member', () => {
    const me = dancer()
    const access = decideAppAccess(user('moreska', 'moreskant'), me)
    expect(access.kind === 'ok' && access.self).toBe(me)
  })

  it('leaves `self` null when the voditelj does not hold `moreskant`', () => {
    const access = decideAppAccess(user('moreska'), dancer())
    expect(access.kind === 'ok' && access.self).toBeNull()
  })

  it('leaves `self` null when the linked Member is no longer a dancer', () => {
    const access = decideAppAccess(user('moreska', 'moreskant'), dancer({ isMoreskant: false }))
    expect(access.kind === 'ok' && access.self).toBeNull()
  })
})

describe('decideAppAccess — the moreškant', () => {
  it('lets a `moreskant` holder in when the linked Member is a live dancer', () => {
    const me = dancer()
    const access = decideAppAccess(user('moreskant'), me)
    expect(access.kind).toBe('ok')
    expect(access.kind === 'ok' && access.self).toBe(me)
    expect(screenKeys(access)).toEqual(['performances', 'leaderboard'])
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

describe('decideAppAccess — the conditional permissions', () => {
  it('denies a `partner` holder with no Partner link', () => {
    expect(decideAppAccess(user('partner'), null)).toEqual({ kind: 'denied' })
  })

  it('unlocks nothing for `refunds` and `dev`, however they are combined', () => {
    expect(decideAppAccess(user('refunds', 'dev'), dancer())).toEqual({ kind: 'denied' })
  })

  it('carries the Partner link through for the screens that scope on it', () => {
    const access = decideAppAccess(user('moreska'), null, { partnerId: '7' })
    expect(access.kind === 'ok' && access.partnerId).toBe('7')
  })
})

describe('decideAppAccess — everybody else', () => {
  it.each([
    ['anonymous', null],
    ['an authenticated account with no permission set', { id: '2', permissions: undefined }],
    ['tickets (Tatjana), until the blagajna screens are built', user('tickets', 'refunds', 'door')],
    ['the door login', user('door')],
    ['a partner POS', user('partner')],
    ['the society season dashboard', user('season_stats')],
    ['a dev-only account', user('dev')],
    ['an editor-only account', user('editor')],
  ])('denies %s', (_label, u) => {
    expect(decideAppAccess(u, null)).toEqual({ kind: 'denied' })
    // A stray Member link changes nothing without the permission.
    expect(decideAppAccess(u, dancer())).toEqual({ kind: 'denied' })
  })

  it('ignores a permission word outside the vocabulary', () => {
    expect(decideAppAccess(user('voditelj'), dancer())).toEqual({ kind: 'denied' })
  })

  it('never lets a single permission other than moreska/moreskant in (sweep)', () => {
    // Today's live table. Every screen ticket that flips a `servesToday` word
    // moves one of these to `true`, and this line is where that shows up.
    for (const p of PERMISSIONS) {
      const expected = p === 'moreska' || p === 'moreskant'
      expect(decideAppAccess(user(p), dancer()).kind === 'ok', `permission ${p}`).toBe(expected)
    }
  })
})

describe('accessMember', () => {
  it('is the account’s own dancer row, or nothing', () => {
    const me = dancer()
    expect(accessMember(decideAppAccess(user('moreska', 'moreskant'), me))).toBe(me)
    expect(accessMember(decideAppAccess(user('moreska'), null))).toBeNull()
    expect(accessMember({ kind: 'denied' })).toBeNull()
  })
})
