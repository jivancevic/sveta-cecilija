import { describe, expect, it } from 'vitest'
import { screenByKey, unlockedScreens } from './screens'
import { compIssueView, holderName, matchMembers, tallyCompsByMember } from './comp-screen'

const members = [
  { id: '1', name: 'Ante Marić' },
  { id: '2', name: 'Marija Anić' },
  { id: '3', name: 'Šime Žuvela' },
]

// The gate: the screen table is what `openScreen('comp')` reads, so "who may
// open Gratis" is a question about `servesToday` and nothing else (#495).
describe('the Gratis gate', () => {
  const ctx = { hasMember: false, hasPartner: false }

  it('opens for a tickets holder', () => {
    expect(unlockedScreens({ permissions: ['tickets'] }, ctx).map((s) => s.key)).toContain('comp')
  })

  it('stays shut for a moreskant, a partner and a door holder', () => {
    for (const permission of ['moreskant', 'moreska', 'partner', 'door', 'users'] as const) {
      expect(
        unlockedScreens({ permissions: [permission] }, { hasMember: true, hasPartner: true }).map(
          (s) => s.key,
        ),
      ).not.toContain('comp')
    }
  })

  it('sits on the English route the map assigned it', () => {
    expect(screenByKey('comp').route).toBe('/app/comp')
  })
})

describe('matchMembers', () => {
  it('returns every member when nothing is typed', () => {
    expect(matchMembers(members, '   ')).toEqual(members)
  })

  it('matches anywhere in the name, ignoring case', () => {
    expect(matchMembers(members, 'MAR').map((m) => m.id)).toEqual(['1', '2'])
  })

  it('matches a name typed without its diacritics', () => {
    // The secretary types on a phone keyboard: "sime zuvela" must find "Šime
    // Žuvela", or the picker is unusable for half the roster.
    expect(matchMembers(members, 'zuvela').map((m) => m.id)).toEqual(['3'])
  })

  it('matches on a surname as well as a first name', () => {
    expect(matchMembers(members, 'maric').map((m) => m.id)).toEqual(['1'])
  })
})

describe('tallyCompsByMember', () => {
  const rows = [
    { memberId: '1', memberName: 'Ante Marić', type: 'adult' as const, cancelled: false },
    { memberId: '1', memberName: 'Ante Marić', type: 'child' as const, cancelled: false },
    { memberId: '1', memberName: 'Ante Marić', type: 'adult' as const, cancelled: true },
    { memberId: '2', memberName: 'Marija Anić', type: 'adult' as const, cancelled: false },
  ]

  it('counts tickets per member, issued and voided apart', () => {
    expect(tallyCompsByMember(rows)).toEqual([
      { memberId: '1', memberName: 'Ante Marić', adults: 1, children: 1, issued: 2, voided: 1 },
      { memberId: '2', memberName: 'Marija Anić', adults: 1, children: 0, issued: 1, voided: 0 },
    ])
  })

  it('leaves a voided seat out of the adult and child split', () => {
    // A voided seat is not a seat anybody sat in; it stays visible as
    // "poništeno" and never as an adult the member received.
    const [row] = tallyCompsByMember([
      { memberId: '9', memberName: 'X', type: 'child', cancelled: true },
    ])
    expect(row).toMatchObject({ adults: 0, children: 0, issued: 0, voided: 1 })
  })

  it('ranks by comps issued, then by name', () => {
    const ranked = tallyCompsByMember([
      { memberId: '1', memberName: 'Zoran', type: 'adult', cancelled: false },
      { memberId: '2', memberName: 'Ana', type: 'adult', cancelled: false },
      { memberId: '3', memberName: 'Boris', type: 'adult', cancelled: false },
      { memberId: '3', memberName: 'Boris', type: 'adult', cancelled: false },
    ])
    expect(ranked.map((r) => r.memberName)).toEqual(['Boris', 'Ana', 'Zoran'])
  })

  it('has nothing to say about a season with no comps', () => {
    expect(tallyCompsByMember([])).toEqual([])
  })
})

describe('holderName', () => {
  it('prefills the printed name from the member who received the comps', () => {
    expect(holderName({ member: { id: '1', name: 'Ante Marić' }, typed: '', edited: false })).toBe(
      'Ante Marić',
    )
  })

  it('keeps what was typed once the name has been edited', () => {
    // ADR-0019: the member is the attribution and is never printed; the holder
    // row is a guest's name the secretary may type over the prefill.
    expect(
      holderName({ member: { id: '1', name: 'Ante Marić' }, typed: 'Ivana Bosnić', edited: true }),
    ).toBe('Ivana Bosnić')
  })

  it('clears back to empty when the name was edited to nothing', () => {
    expect(holderName({ member: { id: '1', name: 'Ante' }, typed: '', edited: true })).toBe('')
  })

  it('is empty while no member is picked', () => {
    expect(holderName({ member: null, typed: '', edited: false })).toBe('')
  })
})

describe('compIssueView', () => {
  const shows = [
    { id: '7', label: 'Petak · 21:30 · Ljetno kino', remaining: 3, soldOut: false },
    { id: '8', label: 'Subota · 21:30 · Ljetno kino', remaining: 0, soldOut: true },
  ]
  const base = { shows, showId: '7', memberId: '1', adults: 1, children: 1 }

  it('shares one pool of seats between the two steppers', () => {
    const view = compIssueView(base)
    expect(view.remaining).toBe(3)
    // One of the three seats is already claimed by the other stepper.
    expect(view.maxAdults).toBe(2)
    expect(view.maxChildren).toBe(2)
    expect(view.total).toBe(2)
    expect(view.canSubmit).toBe(true)
  })

  it('refuses a party larger than the seats left', () => {
    const view = compIssueView({ ...base, adults: 3, children: 1 })
    expect(view.overRemaining).toBe(true)
    expect(view.canSubmit).toBe(false)
  })

  it('refuses to issue without a member, because attribution is the point', () => {
    expect(compIssueView({ ...base, memberId: '' }).canSubmit).toBe(false)
  })

  it('refuses to issue nothing', () => {
    expect(compIssueView({ ...base, adults: 0, children: 0 }).canSubmit).toBe(false)
  })

  it('offers no seat at all on a sold-out evening', () => {
    const view = compIssueView({ ...base, showId: '8', adults: 0, children: 0 })
    expect(view.remaining).toBe(0)
    expect(view.maxAdults).toBe(0)
    expect(view.canSubmit).toBe(false)
  })

  it('has nothing to offer when no performance is picked', () => {
    const view = compIssueView({ ...base, showId: '' })
    expect(view.remaining).toBe(0)
    expect(view.canSubmit).toBe(false)
  })
})
