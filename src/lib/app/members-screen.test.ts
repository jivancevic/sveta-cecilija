import { describe, expect, it } from 'vitest'
import {
  memberListRows,
  memberMatchesSearch,
  memberSearchKey,
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
