import { describe, expect, it } from 'vitest'
import { memberAccess, type MemberAccess } from './member-marks'
import {
  armyOfRole,
  foundLabel,
  initialsOf,
  memberListRows,
  memberMatchesSearch,
  memberSearchKey,
  toMemberListInput,
  type MemberRosterRow,
} from './members-screen'

/** The marks of a dancer who is in and has set nothing up yet. */
const IN: MemberAccess = memberAccess({
  sessions: 1,
  device: { devices: 0, standaloneDevices: 0, pushDevices: 0 },
  hasEmail: false,
  hasOwnPassword: false,
})

/** A dancer who is in, on an installed app that rings, with their own key. */
const READY: MemberAccess = memberAccess({
  sessions: 1,
  device: { devices: 1, standaloneDevices: 1, pushDevices: 1 },
  hasEmail: true,
  hasOwnPassword: true,
})

// The list half of Članovi (#511): who is on it, in what order, and what the
// search box actually matches.

function member(over: Partial<MemberRosterRow> & { id: string }): MemberRosterRow {
  return {
    name: 'Ime Prezime',
    nickname: null,
    mobile: null,
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
    const list = memberListRows(rows, {}, '')
    expect(list.map((r) => r.id)).toEqual(['3', '1', '2'])
  })

  it('shows the nickname as the name, with the real name underneath', () => {
    const [, ciro] = memberListRows(rows, {}, '')
    expect(ciro.nickname).toBe('Ćiro')
    expect(ciro.name).toBe('Ivan Marić')
  })

  it('falls back to the real name when a moreškant has no nickname', () => {
    const list = memberListRows([member({ id: '9', name: 'Bez Nadimka' })], {}, '')
    expect(list[0].nickname).toBe('Bez Nadimka')
  })

  it('reads each row’s marks off the map, and "nije ušao" for an id that is not in it', () => {
    const list = memberListRows(rows, { '1': READY }, '')
    expect(list.find((r) => r.id === '1')?.access).toEqual(READY)
    expect(list.find((r) => r.id === '3')?.access).toEqual({ kind: 'never-in' })
  })

  it('draws no marks at all when the signal could not be read', () => {
    // An empty map would say "nije ušao" about the whole roster, which is a lie
    // a voditelj would act on; null says nothing, which is the truth.
    const list = memberListRows(rows, null, '')
    expect(list.every((r) => r.access === null)).toBe(true)
  })

  it('labels the primary role in Croatian and says so when there is none', () => {
    const list = memberListRows(rows, {}, '')
    expect(list.find((r) => r.id === '1')?.roleLabel).toBe('Crni')
    expect(list.find((r) => r.id === '3')?.roleLabel).toBe('bez uloge')
  })

  it('applies the search, keeping the same order', () => {
    expect(memberListRows(rows, {}, 'ciro').map((r) => r.id)).toEqual(['1'])
  })

  it('links each row at its own profile', () => {
    expect(memberListRows(rows, {}, 'ciro')[0].href).toBe('/app/members/1')
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
  // not, and #651 (ADR-0028) narrowed rather than reversed it — no Member row
  // carries an address at all now, and the reader's own is on their own Profil.
  // The list is a client component, so anything it is handed is in the HTML,
  // which is why this is a PROJECTION and not a spread: a stray address on the
  // object it is handed must not survive the trip.
  it('drops an e-mail smuggled onto the row and keeps the mobile', () => {
    const row = { ...member({ id: '1', mobile: '0912345678' }), email: 'ciro@example.test' }
    const input = toMemberListInput(row as never)
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

// The row's mark (#573) and the three marks on its right (#653).

describe('armyOfRole', () => {
  it('reads a special role back to the army it presupposes', () => {
    expect(armyOfRole('otmanovic')).toBe('crni')
    expect(armyOfRole('bili_kralj')).toBe('bili')
  })

  // `ARMY_OF_ROLE` says a bula is in neither army, which is right for a
  // headcount and wrong for a disc, where bula is a colour of its own.
  it('gives the bula her own colour, not neither', () => {
    expect(armyOfRole('bula')).toBe('bula')
  })

  it('is null for a dancer with no role yet, which draws the empty disc', () => {
    expect(armyOfRole(null)).toBeNull()
    expect(armyOfRole('')).toBeNull()
    expect(armyOfRole('kapetan')).toBeNull()
  })
})

describe('initialsOf', () => {
  it('is the first letter of the first two words', () => {
    expect(initialsOf('Ivan Marić')).toBe('IM')
    expect(initialsOf('Ivan Petar Marić')).toBe('IP')
  })

  it('keeps Croatian letters as Croatian letters', () => {
    expect(initialsOf('Ćiro Šain')).toBe('ĆŠ')
  })

  it('gives one letter for one word, and nothing for nothing', () => {
    expect(initialsOf('Ćiro')).toBe('Ć')
    expect(initialsOf('   ')).toBe('')
  })
})

describe('memberListRows, with a chip on', () => {
  const rows = [
    member({ id: '1', name: 'Ana Anić', active: true, primaryRole: 'crni' }),
    member({ id: '2', name: 'Bruno Bulić', active: false, primaryRole: 'bili' }),
  ]

  it('carries the disc and the dot on every row', () => {
    const [first] = memberListRows(rows, {}, '')
    expect(first.army).toBe('crni')
    expect(first.initials).toBe('AA')
  })

  // What each chip MEANS is `member-marks.test.ts`; this is only that the list
  // applies it after the search and keeps its order.
  it('narrows to what the chip asks for, search and order unchanged', () => {
    const access = { '1': READY, '2': IN }
    expect(memberListRows(rows, access, '', 'no-access').map((r) => r.id)).toEqual(['2'])
    expect(memberListRows(rows, access, '', 'no-push').map((r) => r.id)).toEqual(['2'])
    expect(memberListRows(rows, access, '', 'all')).toHaveLength(2)
  })
})
