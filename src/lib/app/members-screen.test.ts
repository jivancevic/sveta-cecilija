import { describe, expect, it } from 'vitest'
import {
  foundLabel,
  memberListRows,
  memberMatchesSearch,
  memberSearchKey,
  toMemberListInput,
  type MemberRosterRow,
} from './members-screen'

// The list half of Članovi (#511): who is on it, in what order, and what the
// search box actually matches.

function member(over: Partial<MemberRosterRow> & { id: string }): MemberRosterRow {
  return {
    name: 'Ime Prezime',
    nickname: null,
    mobile: null,
    email: null,
    roles: [],
    primaryRole: null,
    active: true,
    yearRound: false,
    isMoreskant: true,
    ...over,
  }
}

describe('memberSearchKey', () => {
  it('folds Croatian diacritics rather than dropping the letter', () => {
    expect(memberSearchKey('Ćišo')).toBe('ciso')
    expect(memberSearchKey('Đuro')).toBe('djuro')
    expect(memberSearchKey('Žuti')).toBe('zuti')
  })

  it('folds case and runs spaces together the way a typed query does', () => {
    expect(memberSearchKey('Ivan  Marić')).toBe('ivan-maric')
  })
})

describe('memberMatchesSearch', () => {
  const cici = member({ id: '1', name: 'Ivan Marić', nickname: 'Ćiro' })

  it('matches a nickname typed without its diacritics', () => {
    expect(memberMatchesSearch(cici, 'ciro')).toBe(true)
  })

  it('matches a nickname typed WITH its diacritics', () => {
    expect(memberMatchesSearch(cici, 'Ćiro')).toBe(true)
  })

  it('matches the real name behind the nickname, part of it included', () => {
    expect(memberMatchesSearch(cici, 'maric')).toBe(true)
    expect(memberMatchesSearch(cici, 'ivan mar')).toBe(true)
  })

  it('does not match somebody else', () => {
    expect(memberMatchesSearch(cici, 'pero')).toBe(false)
  })

  it('treats an empty or symbol-only query as no filter at all', () => {
    expect(memberMatchesSearch(cici, '')).toBe(true)
    expect(memberMatchesSearch(cici, '   ')).toBe(true)
    expect(memberMatchesSearch(cici, '###')).toBe(true)
  })
})

describe('memberListRows', () => {
  const rows = [
    member({ id: '1', name: 'Ivan Marić', nickname: 'Ćiro', primaryRole: 'crni', roles: ['crni'] }),
    member({ id: '2', name: 'Ante Anić', nickname: 'Bepo', active: false }),
    member({ id: '3', name: 'Pero Perić', nickname: 'Ana' }),
  ]

  it('puts the active moreškanti first and orders each half by the shown name', () => {
    const list = memberListRows(rows, new Set(), '')
    expect(list.map((r) => r.id)).toEqual(['3', '1', '2'])
  })

  it('shows the nickname as the name, with the real name underneath', () => {
    const [, ciro] = memberListRows(rows, new Set(), '')
    expect(ciro.nickname).toBe('Ćiro')
    expect(ciro.name).toBe('Ivan Marić')
  })

  it('falls back to the real name when a moreškant has no nickname', () => {
    const list = memberListRows([member({ id: '9', name: 'Bez Nadimka' })], new Set(), '')
    expect(list[0].nickname).toBe('Bez Nadimka')
  })

  it('derives has-login from the set of member ids some login points at', () => {
    const list = memberListRows(rows, new Set(['1']), '')
    expect(list.find((r) => r.id === '1')?.hasLogin).toBe(true)
    expect(list.find((r) => r.id === '3')?.hasLogin).toBe(false)
  })

  it('labels the primary role in Croatian and says so when there is none', () => {
    const list = memberListRows(rows, new Set(), '')
    expect(list.find((r) => r.id === '1')?.roleLabel).toBe('Crni')
    expect(list.find((r) => r.id === '3')?.roleLabel).toBe('bez uloge')
  })

  it('applies the search, keeping the same order', () => {
    expect(memberListRows(rows, new Set(), 'ciro').map((r) => r.id)).toEqual(['1'])
  })

  it('links each row at its own profile', () => {
    expect(memberListRows(rows, new Set(), 'ciro')[0].href).toBe('/app/members/1')
  })
})

describe('foundLabel', () => {
  // Croatian has three plural buckets and an 11-14 exception, which is exactly
  // what a hand-written `count < 5` rule gets wrong: 22 takes the SAME form as
  // 2, and 12 takes the same form as 15.
  it('declines "moreškant" through all three buckets, 11-14 included', () => {
    expect(foundLabel(1)).toBe('1 moreškant')
    expect(foundLabel(2)).toBe('2 moreškanta')
    expect(foundLabel(5)).toBe('5 moreškanata')
    expect(foundLabel(11)).toBe('11 moreškanata')
    expect(foundLabel(12)).toBe('12 moreškanata')
    expect(foundLabel(21)).toBe('21 moreškant')
    expect(foundLabel(22)).toBe('22 moreškanta')
    expect(foundLabel(25)).toBe('25 moreškanata')
  })

  it('says none without a plural trap', () => {
    expect(foundLabel(0)).toBe('0 moreškanata')
  })
})

describe('toMemberListInput', () => {
  // ADR-0024's PII boundary: a mobile may cross into `/app` and an e-mail may
  // not. The list is a client component, so anything it is handed is in the
  // HTML — the projection is what keeps the address out of it.
  it('drops the e-mail and keeps the mobile', () => {
    const row = member({ id: '1', mobile: '0912345678', email: 'ciro@example.test' })
    const input = toMemberListInput(row)
    expect(input).not.toHaveProperty('email')
    expect(Object.keys(input)).not.toContain('email')
    expect(input.mobile).toBe('0912345678')
  })

  it('carries everything the list actually renders', () => {
    const row = member({ id: '7', name: 'Ivan Marić', nickname: 'Ćiro', primaryRole: 'crni', roles: ['crni'] })
    expect(toMemberListInput(row)).toEqual({
      id: '7',
      name: 'Ivan Marić',
      nickname: 'Ćiro',
      mobile: null,
      roles: ['crni'],
      primaryRole: 'crni',
      active: true,
      yearRound: false,
      isMoreskant: true,
    })
  })
})
