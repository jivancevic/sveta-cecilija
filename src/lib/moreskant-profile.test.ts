import { describe, expect, it } from 'vitest'
import {
  DANCE_ROLES,
  MoreskantProfileError,
  isMoreskantRow,
  nicknameKey,
  validateAndNormaliseMoreskant,
} from './moreskant-profile'

// A complete, valid moreškant profile; each case below breaks exactly one rule.
function profile(over: Record<string, unknown> = {}) {
  return {
    name: 'Ivan Fabris',
    isMoreskant: true,
    nickname: 'Cici',
    mobile: '+385 91 111 1111',
    email: 'cici@example.com',
    roles: ['crni', 'crni_kralj'],
    primaryRole: 'crni_kralj',
    ...over,
  }
}

describe('the dance-role vocabulary', () => {
  it('is the six roles of ADR-0024, in the glossary order', () => {
    expect(DANCE_ROLES).toEqual(['crni', 'bili', 'crni_kralj', 'otmanovic', 'bili_kralj', 'bula'])
  })
})

describe('isMoreskantRow', () => {
  it.each([
    [{ isMoreskant: true }, true],
    [{ isMoreskant: false }, false],
    [{ is_moreskant: true }, true],
    [{ is_moreskant: false }, false],
    // Absent means "not a moreškant": the column defaults to false and the 14
    // production rows predate the flag.
    [{}, false],
    [{ isMoreskant: null }, false],
    [{ isMoreskant: 'true' }, false],
  ])('%o → %s', (row, expected) => {
    expect(isMoreskantRow(row)).toBe(expected)
  })
})

describe('nicknameKey', () => {
  it('folds case and surrounding whitespace so "cici" and " Cici " collide', () => {
    expect(nicknameKey(' Cici ')).toBe('cici')
    expect(nicknameKey('CICI')).toBe(nicknameKey('cici'))
  })

  it('is empty for a blank or missing nickname', () => {
    expect(nicknameKey('   ')).toBe('')
    expect(nicknameKey(undefined)).toBe('')
    expect(nicknameKey(null)).toBe('')
  })
})

describe('validateAndNormaliseMoreskant — not a moreškant', () => {
  it.each([
    ['the flag is false', { isMoreskant: false }],
    ['the flag is absent', {}],
  ])('skips every rule when %s', (_label, row) => {
    // No nickname, no roles, no primary role: still fine.
    expect(() => validateAndNormaliseMoreskant({ name: 'Ana', ...row })).not.toThrow()
  })

  it('leaves the row untouched', () => {
    const row = { name: 'Ana', isMoreskant: false, nickname: '  ', roles: [] }
    expect(validateAndNormaliseMoreskant(row)).toEqual(row)
  })
})

describe('validateAndNormaliseMoreskant — a valid profile', () => {
  it('passes and returns a new object', () => {
    const input = profile()
    const out = validateAndNormaliseMoreskant(input)
    expect(out).not.toBe(input)
    expect(out.nickname).toBe('Cici')
  })

  it('trims the nickname, mobile and email', () => {
    const out = validateAndNormaliseMoreskant(
      profile({ nickname: '  Cici  ', mobile: ' +385 91 ', email: '  Cici@Example.com ' }),
    )
    expect(out.nickname).toBe('Cici')
    expect(out.mobile).toBe('+385 91')
    // Email is lower-cased: it becomes the login address at invitation time (#424).
    expect(out.email).toBe('cici@example.com')
  })

  it.each([
    ['a plain crni', ['crni'], 'crni'],
    ['a plain bili', ['bili'], 'bili'],
    ['a bula', ['bula'], 'bula'],
    ['a two-army dancer', ['crni', 'bili'], 'bili'],
    ['a crni king', ['crni', 'crni_kralj'], 'crni_kralj'],
    ['an otmanović', ['crni', 'otmanovic'], 'otmanovic'],
    ['a bili king', ['bili', 'bili_kralj'], 'bili_kralj'],
    ['every role at once', [...DANCE_ROLES], 'bula'],
  ])('accepts %s', (_label, roles, primaryRole) => {
    expect(() => validateAndNormaliseMoreskant(profile({ roles, primaryRole }))).not.toThrow()
  })

  it('does not require a mobile or an email (the voditelj fills them in later)', () => {
    expect(() =>
      validateAndNormaliseMoreskant(profile({ mobile: undefined, email: undefined })),
    ).not.toThrow()
  })
})

describe('validateAndNormaliseMoreskant — the rules', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['a missing nickname', { nickname: undefined }, /nadimak/i],
    ['a blank nickname', { nickname: '   ' }, /nadimak/i],
    ['no roles at all', { roles: [], primaryRole: undefined }, /ulog/i],
    ['a missing roles field', { roles: undefined, primaryRole: undefined }, /ulog/i],
    ['an unknown role', { roles: ['crni', 'kapetan'], primaryRole: 'crni' }, /kapetan/],
    ['a missing primary role', { primaryRole: undefined }, /glavn/i],
    ['an unknown primary role', { primaryRole: 'kapetan' }, /kapetan/],
    [
      'a primary role that is not among the roles',
      { roles: ['crni'], primaryRole: 'bili' },
      /glavn/i,
    ],
    ['crni_kralj without crni', { roles: ['bili', 'crni_kralj'], primaryRole: 'crni_kralj' }, /crni/i],
    ['otmanovic without crni', { roles: ['bili', 'otmanovic'], primaryRole: 'otmanovic' }, /crni/i],
    ['bili_kralj without bili', { roles: ['crni', 'bili_kralj'], primaryRole: 'bili_kralj' }, /bili/i],
  ]

  it.each(cases)('refuses %s', (_label, over, message) => {
    expect(() => validateAndNormaliseMoreskant(profile(over))).toThrow(MoreskantProfileError)
    expect(() => validateAndNormaliseMoreskant(profile(over))).toThrow(message)
  })
})

describe('validateAndNormaliseMoreskant — nickname uniqueness', () => {
  it('refuses a nickname already taken by another moreškant', () => {
    expect(() =>
      validateAndNormaliseMoreskant(profile(), { otherNicknames: ['Cici'] }),
    ).toThrow(/Cici/)
  })

  it('compares case- and whitespace-insensitively', () => {
    expect(() =>
      validateAndNormaliseMoreskant(profile({ nickname: 'cici' }), { otherNicknames: [' CICI '] }),
    ).toThrow(MoreskantProfileError)
  })

  it('allows a nickname nobody else holds', () => {
    expect(() =>
      validateAndNormaliseMoreskant(profile(), { otherNicknames: ['Bepo', 'Duje'] }),
    ).not.toThrow()
  })

  it('ignores blank entries in the taken list', () => {
    expect(() =>
      validateAndNormaliseMoreskant(profile(), { otherNicknames: ['', '   ', null, undefined]  }),
    ).not.toThrow()
  })

  it('is not checked at all when the row is not a moreškant', () => {
    expect(() =>
      validateAndNormaliseMoreskant({ name: 'Ana', isMoreskant: false, nickname: 'Cici' }, {
        otherNicknames: ['Cici'],
      }),
    ).not.toThrow()
  })
})
