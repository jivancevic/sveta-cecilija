import { describe, expect, it } from 'vitest'
import { effectiveLineup, rolesPresent, stanjeView } from './stanje-screen'
import type { LineupRow, PerformanceDetail } from './detail-loaders'
import type { RosterPerson } from '@/lib/attendance/army-count'
import { APP_STRINGS } from './strings'

// #566 — what Stanje says, over a fixture detail. The rules asserted here are
// the ones a screenshot cannot prove: which column a name is in, which titles
// that name may be given, where the empty places stop, and that a crown never
// comes from a profile.

const person = (memberId: string, nickname: string): RosterPerson => ({
  memberId,
  nickname,
  mobile: null,
})

const CICI = person('1', 'Ćići')
const DADO = person('2', 'Dado')
const BEPO = person('3', 'Bepo')
const MARE = person('4', 'Mare')
const GRGO = person('5', 'Grgo')

function detail(over: Partial<PerformanceDetail> = {}): PerformanceDetail {
  const base: PerformanceDetail = {
    performance: {
      id: '10',
      date: '2026-09-19',
      time: '21:00',
      kind: 'redovna',
      isPublic: true,
      venue: 'ljetno-kino',
      location: null,
      client: null,
      cancelled: false,
      voditeljNote: 'Skup u 20:15',
      startMs: Date.parse('2026-09-19T19:00:00.000Z'),
      thresholdCrni: 3,
      thresholdBili: 2,
      myAnswer: null,
      myArmy: null,
      myTitle: null,
      lineupConfirmed: false,
      canAnswer: true,
      chip: null,
      postava: null,
    },
    count: {
      crni: { count: 2, threshold: 3, below: true, nicknames: [], members: [CICI, DADO] },
      bili: { count: 1, threshold: 2, below: true, nicknames: [], members: [BEPO] },
      bula: [MARE],
      notComing: [],
    withdrawn: [],
      noAnswer: [GRGO],
    },
    voditelj: true,
    keepsList: true,
    listKeepers: [],
    canEditOthers: true,
    canAlarm: true,
    moveTargets: { '2': ['crni', 'bili'] },
    myMemberId: '1',
    lineup: {
      confirmed: false,
      confirmedAt: null,
      confirmedBy: null,
      entries: [],
      suggested: [
        { memberId: '1', nickname: 'Ćići', role: 'crni' },
        { memberId: '2', nickname: 'Dado', role: 'crni' },
        { memberId: '3', nickname: 'Bepo', role: 'bili' },
        { memberId: '4', nickname: 'Mare', role: 'bula' },
      ],
      warnings: [],
      roster: [],
      canEdit: true,
    },
    comps: {
      visible: false,
      seatsAvailable: true,
      issued: 0,
      remaining: 4,
      defaultName: '',
      orders: [],
    },
    nowMs: Date.parse('2026-09-19T10:00:00.000Z'),
  }
  return { ...base, ...over }
}

describe('stanjeView header', () => {
  it('names the evening in the dancer register and never its client', () => {
    const out = stanjeView(detail())
    expect(out.head).toBe('Subota, 19. rujna · Redovna')
    expect(out.meta).toBe('21:00 · Ljetno kino')
  })

  it('reads a booking as Vanredna, with its free-text place', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      performance: {
        ...d.performance,
        kind: 'dmc',
        isPublic: false,
        venue: null,
        location: 'Luka',
        client: 'Le Ponant',
      },
    })
    expect(out.head).toBe('Subota, 19. rujna · Vanredna')
    expect(out.meta).toBe('21:00 · Luka')
    expect(JSON.stringify(out)).not.toContain('Le Ponant')
  })

  it('reads an Experience as itself, the third category (#591)', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      performance: {
        ...d.performance,
        kind: 'experience',
        isPublic: false,
        venue: null,
        location: 'Prostor Sv. Cecilije',
      },
    })
    expect(out.head).toBe('Subota, 19. rujna · Experience')
    // The screen draws those two apart since #592: the date, then the kind as a
    // chip in the tone its disc wears on Moreška.
    expect(out.headDate).toBe('Subota, 19. rujna')
    expect(out.kind).toBe('Experience')
    expect(out.tone).toBe('experience')
  })
})

describe('stanjeView columns', () => {
  it('puts crni first and bili second, each against its own threshold', () => {
    const [crni, bili] = stanjeView(detail()).columns
    expect(crni).toMatchObject({ army: 'crni', head: '2 od 3', below: true })
    expect(bili).toMatchObject({ army: 'bili', head: '1 od 2', below: true })
    expect(crni!.people.map((p) => p.nickname)).toEqual(['Ćići', 'Dado'])
  })

  // #627: both columns run to the same number of rows, one past the fullest
  // thing on the evening, so the two sides of the pier stand at one height and
  // there is always exactly one place left to drop somebody into. The fixture
  // is crni 2 of 3 and bili 1 of 2, so both columns end at four.
  // #633: the height is the THRESHOLD until an army reaches it. Three of three
  // draws three places and not four, so a voditelj counting holes counts the
  // ones the evening actually wants.
  it('draws both columns to the threshold, at the same height', () => {
    const [crni, bili] = stanjeView(detail()).columns
    expect(crni!.slots).toEqual(['mjesto 3'])
    expect(bili!.slots).toEqual(['mjesto 2', 'mjesto 3'])
    expect(crni!.people.length + crni!.slots.length).toBe(
      bili!.people.length + bili!.slots.length,
    )
  })

  // #633 — the threshold IS the height, and the eleventh place opens only once
  // some army has filled the tenth. Josip: "kada je prag 10, onda prikaži 10
  // mjesta, sve do momenta u kojem se u nekoj vojci ne popuni 10. mjesto".
  it('draws exactly the threshold while both armies are short of it', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      count: {
        ...d.count,
        crni: { ...d.count.crni, threshold: 10, members: [CICI, DADO] },
        bili: { ...d.count.bili, threshold: 10, members: [BEPO] },
      },
    })
    const [crni, bili] = out.columns
    expect(crni!.people.length + crni!.slots.length).toBe(10)
    expect(bili!.people.length + bili!.slots.length).toBe(10)
    expect(crni!.slots.at(-1)).toBe('mjesto 10')
  })

  it('opens one more place the moment an army fills the last one', () => {
    const d = detail()
    // The two the suggested postava names are in it, so nobody is a dictated
    // row standing above the places and pushing the column taller.
    const ten = [CICI, DADO, ...Array.from({ length: 8 }, (_, i) => person(`c${i}`, `Crni ${i}`))]
    const out = stanjeView({
      ...d,
      count: {
        ...d.count,
        crni: { ...d.count.crni, count: 10, threshold: 10, members: ten },
        bili: { ...d.count.bili, threshold: 10, members: [BEPO] },
      },
    })
    const [crni, bili] = out.columns
    expect(crni!.slots).toEqual(['mjesto 11'])
    // The other column keeps up, because both sides stand at one height.
    expect(bili!.people.length + bili!.slots.length).toBe(11)
  })

  // #627, found in review: a dictated row is drawn in its column but is not in
  // the ANSWER count, so measuring the height by the count let one column stand
  // taller than the other — the very thing the equal heights are here to stop.
  it('counts a dictated row towards the height, and numbers the places past it', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      lineup: {
        ...d.lineup,
        entries: [{ memberId: '5', nickname: 'Grgo', role: 'bili' }],
      },
    })
    const [crni, bili] = out.columns
    expect(bili!.people.map((p) => p.nickname)).toContain('Grgo')
    expect(crni!.people.length + crni!.slots.length).toBe(
      bili!.people.length + bili!.slots.length,
    )
    // Grgo stands second in the bili column, so the next empty place is third.
    expect(bili!.slots[0]).toBe('mjesto 3')
  })

  it('draws one place past an army that is already at or over its threshold', () => {
    const d = detail()
    // The members and the count must agree, the way `countArmies` always makes
    // them: since #620 the column derives its number from the people it is
    // about to draw, so the names and the head cannot disagree even when a
    // voditelj is lifted out of them.
    const out = stanjeView({
      ...d,
      count: {
        ...d.count,
        crni: {
          count: 4,
          threshold: 3,
          below: false,
          nicknames: [],
          members: [CICI, DADO, BEPO, GRGO],
        },
      },
    })
    // A full column still shows one empty place (#627): eight of eight used to
    // end at the last name with nowhere to add a ninth.
    expect(out.columns[0]!.slots).toEqual(['mjesto 5'])
    expect(out.columns[1]!.slots).toEqual(['mjesto 2', 'mjesto 3', 'mjesto 4', 'mjesto 5'])
  })

  it('offers the two crni titles in the crni column and the one bili title in the other', () => {
    const [crni, bili] = stanjeView(detail()).columns
    expect(crni!.people[0]!.titles).toEqual(['crni_kralj', 'otmanovic'])
    expect(bili!.people[0]!.titles).toEqual(['bili_kralj'])
  })

  it('offers the move only to a dancer whose profile covers the other army', () => {
    const [crni] = stanjeView(detail()).columns
    expect(crni!.people.find((p) => p.nickname === 'Ćići')!.moveTo).toBeNull()
    expect(crni!.people.find((p) => p.nickname === 'Dado')!.moveTo).toBe('bili')
  })
})

describe('stanjeView titles', () => {
  it('wears no crown until the voditelj gives one, whatever the profile says', () => {
    // Nobody in either army is titled before the voditelj hands one out: a
    // title is the evening's, never the person's (glossary: *Title*).
    const out = stanjeView(detail())
    expect(out.columns.flatMap((c) => c.people).every((p) => p.title === null)).toBe(true)
  })

  it('counts the bula as given the moment she answers, because her role IS her title', () => {
    // The one title the vocabulary cannot separate from its army: a dancer in
    // the Bule card is the bula of the night (`lineupWithTitles` keeps exactly
    // one), so the tally starts at one rather than at zero.
    const out = stanjeView(detail())
    expect(out.bule[0]!.title).toBe('bula')
    expect(out.titlesGiven).toBe(1)
  })

  // #627: one bula and no second one. The row that would add her is gone the
  // moment the first is in, and `validateLineupEntries` refuses the write as
  // well, so this is the courtesy rather than the rule.
  it('offers Dodaj bulu only while there is no bula', () => {
    expect(stanjeView(detail()).buleAddRow).toBeNull()
    const d = detail()
    const out = stanjeView({
      ...d,
      count: { ...d.count, bula: [] },
      lineup: {
        ...d.lineup,
        entries: d.lineup.entries.filter((e) => e.role !== 'bula'),
        suggested: d.lineup.suggested.filter((e) => e.role !== 'bula'),
      },
    })
    expect(out.buleAddRow).toBe('Dodaj bulu')
  })

  it('counts a title the moment it is stored, and puts it on the name', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      lineup: {
        ...d.lineup,
        entries: [
          { memberId: '1', nickname: 'Ćići', role: 'crni_kralj' },
          { memberId: '4', nickname: 'Mare', role: 'bula' },
        ],
      },
    })
    expect(out.columns[0]!.people.find((p) => p.nickname === 'Ćići')!.title).toBe('crni_kralj')
    expect(out.bule[0]!.title).toBe('bula')
    expect(out.titlesGiven).toBe(2)
  })

  it('counts a stored title of a member with no answer', () => {
    // GRGO is on the roster with no attendance row at all: the postava was
    // dictated (MCP, or the Backoffice editor) before anybody answered. His
    // title counts, or an evening entered from the paper list could never reach
    // four and could never be confirmed from this screen.
    const d = detail()
    const out = stanjeView({
      ...d,
      lineup: {
        ...d.lineup,
        entries: [
          { memberId: '5', nickname: 'Grgo', role: 'bili_kralj' },
          { memberId: '4', nickname: 'Mare', role: 'bula' },
        ],
      },
    })
    expect(out.lineup).toContainEqual({ memberId: '5', role: 'bili_kralj' })
    expect(out.titlesGiven).toBe(2)
  })

  it('stands a dictated row in its column, with the chip that says why', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      lineup: {
        ...d.lineup,
        entries: [{ memberId: '5', nickname: 'Grgo', role: 'bili_kralj' }],
      },
    })
    const bili = out.columns[1]!
    // The head still counts ANSWERS: the ArmyBar above it says the same number.
    expect(bili.head).toBe('1 od 2')
    // The BILI KRALJ heads the column whether he answered or not (#620): a
    // title dictates the top, and "did they tap the button" is not a fact about
    // where somebody stands on the pier.
    expect(bili.people.map((p) => p.nickname)).toEqual(['Grgo', 'Bepo'])
    expect(bili.people[0]).toMatchObject({
      title: 'bili_kralj',
      answer: null,
      noAnswer: true,
      titles: ['bili_kralj'],
    })
    // And he is still on the "Bez odgovora" list, because he still has not
    // answered: a postava row is not an answer.
    expect(out.noAnswer.map((p) => p.nickname)).toEqual(['Grgo'])
  })

  it('drops a stored row for somebody who said no, chip or no chip', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      count: { ...d.count, notComing: [person('5', 'Grgo')], noAnswer: [] },
      lineup: {
        ...d.lineup,
        entries: [{ memberId: '5', nickname: 'Grgo', role: 'bili_kralj' }],
      },
    })
    expect(out.lineup.some((entry) => entry.memberId === '5')).toBe(false)
    expect(out.columns[1]!.people.map((p) => p.nickname)).toEqual(['Bepo'])
  })

  it('hands the whole postava over as the list a title write replaces', () => {
    const out = stanjeView(detail())
    expect(out.lineup).toEqual([
      { memberId: '1', role: 'crni' },
      { memberId: '2', role: 'crni' },
      { memberId: '3', role: 'bili' },
      { memberId: '4', role: 'bula' },
    ])
  })
})

describe('stanjeView for a dancer', () => {
  // The loader hands a dancer the draft itself now (#670) and keeps back only
  // the keeper's instruments, so that is what this fixture is.
  const draft: LineupRow[] = [{ memberId: '3', nickname: 'Bepo', role: 'bili_kralj' }]
  const asDancer = (entries: LineupRow[] = draft) => {
    const d = detail()
    return stanjeView({
      ...d,
      voditelj: false,
      keepsList: false,
      canEditOthers: false,
      moveTargets: {},
      lineup: { ...d.lineup, entries, suggested: [], warnings: [], canEdit: false },
    })
  }

  it('shows the titles of a draft the voditelj has not confirmed', () => {
    const out = asDancer()
    const titled = out.columns.flatMap((c) => c.people).filter((p) => p.title !== null)
    expect(titled.map((p) => p.title)).toEqual(['bili_kralj'])
  })

  it('keeps the tally of given titles to whoever is assembling the postava', () => {
    // A dancer can act on neither the count nor the warnings: they are the
    // checklist of somebody else's job (#670). The names carry the crowns; the
    // progress of the job does not leave the keeper.
    expect(asDancer().titlesGiven).toBeNull()
    expect(asDancer().canConfirm).toBe(false)
  })

  it('shows the untitled roles and the rows nobody answered for', () => {
    // "Plesač treba vidjeti postavu kao i voditelj": not only the crowns. A
    // dictated row — written into the postava by the voditelj, no answer given
    // — stands in its column with its own chip, the way it does for a keeper.
    const out = asDancer([
      { memberId: '3', nickname: 'Bepo', role: 'bili_kralj' },
      { memberId: '5', nickname: 'Niko', role: 'bili' },
      { memberId: '4', nickname: 'Mare', role: 'bula' },
    ])
    const everyone = out.columns.flatMap((c) => c.people)
    expect(everyone.map((p) => p.memberId)).toContain('5')
    expect(everyone.find((p) => p.memberId === '5')?.title).toBeNull()
    // The bula is not a column but the Bule card, and it is a title all the
    // same: all four are the dancer's to see, not three of them.
    expect(out.bule.find((p) => p.memberId === '4')?.title).toBe('bula')
  })

  it('shows the titles once the postava is confirmed', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      voditelj: false,
      keepsList: false,
      canEditOthers: false,
      moveTargets: {},
      lineup: {
        ...d.lineup,
        confirmed: true,
        canEdit: false,
        suggested: [],
        entries: [{ memberId: '3', nickname: 'Bepo', role: 'bili_kralj' }],
      },
    })
    expect(out.confirmed).toBe(true)
    expect(out.columns[1]!.people[0]!.title).toBe('bili_kralj')
  })
})

describe('stanjeView call message', () => {
  it('previews the alarm exactly as the sender builds it, with the live headcount', () => {
    expect(stanjeView(detail()).callMessage).toEqual({
      title: 'Sokoliću, fali nas!',
      body: 'Stanje za nastup subota, 19. rujna u 21:00: 1 bilih, 2 crnih',
    })
  })
})

describe('effectiveLineup', () => {
  it('is the stored list once the postava is confirmed, never the answers', () => {
    // After Potvrdi the postava IS the record of the evening. Re-deriving it
    // from answers that keep arriving would change a list nobody may change.
    const d = detail()
    expect(
      effectiveLineup(
        {
          ...d.lineup,
          confirmed: true,
          canEdit: false,
          entries: [{ memberId: '1', nickname: 'Ćići', role: 'crni_kralj' }],
        },
        ['1', '2', '3', '4'],
      ),
    ).toEqual([{ memberId: '1', role: 'crni_kralj' }])
  })
})

/* ── #620: the nastup has started, the postava is confirmed, and the four
   pickers ───────────────────────────────────────────────────────────────── */

/** The same evening, an hour after it began. */
const started = (over: Partial<PerformanceDetail> = {}) =>
  detail({ nowMs: Date.parse('2026-09-19T20:00:00.000Z'), ...over })

/** A roster with profiles on it, which is what the pickers read. */
const ROSTER = [
  {
    memberId: '1',
    nickname: 'Ćići',
    name: 'Ivan Marić',
    roles: ['crni', 'crni_kralj'],
    primaryRole: 'crni_kralj',
  },
  { memberId: '2', nickname: 'Dado', name: 'Damir Foretić', roles: ['crni', 'bili'], primaryRole: 'crni' },
  { memberId: '3', nickname: 'Bepo', name: 'Josip Depolo', roles: ['bili'], primaryRole: 'bili' },
  { memberId: '4', nickname: 'Mare', name: 'Marija Šeparović', roles: ['bula'], primaryRole: 'bula' },
  {
    memberId: '5',
    nickname: 'Grgo',
    name: 'Grgur Ivančević',
    roles: ['bili', 'bili_kralj'],
    primaryRole: 'bili_kralj',
  },
] as const

function withRoster(over: Partial<PerformanceDetail> = {}): PerformanceDetail {
  const d = detail(over)
  return {
    ...d,
    lineup: {
      ...d.lineup,
      roster: ROSTER.map((r) => ({
        memberId: r.memberId,
        nickname: r.nickname,
        name: r.name,
        roles: [...r.roles],
        primaryRole: r.primaryRole,
      })),
    },
  }
}

describe('stanjeView on a past nastup (#620)', () => {
  it('says the plain number in a column head, with no threshold beside it', () => {
    const out = stanjeView(started())
    expect(out.past).toBe(true)
    expect(out.columns[0]!.head).toBe('2')
    expect(out.columns[1]!.head).toBe('1')
  })

  it('draws no empty places, and one Dodaj row in their place', () => {
    const out = stanjeView(started())
    expect(out.columns[0]!.slots).toEqual([])
    expect(out.columns[0]!.addRow).toBe('Dodaj u crne')
    expect(out.columns[1]!.addRow).toBe('Dodaj u bile')
  })

  it('stops calling an army short: nothing is missing from a danced evening', () => {
    const out = stanjeView(started())
    expect(out.columns.some((c) => c.below)).toBe(false)
  })

  it('still draws the places and the threshold before the nastup', () => {
    const out = stanjeView(detail())
    expect(out.past).toBe(false)
    expect(out.columns[0]!.head).toBe('2 od 3')
    expect(out.columns[0]!.slots).toEqual(['mjesto 3'])
    expect(out.columns[0]!.addRow).toBeNull()
  })
})

describe('stanjeView on a confirmed postava (#620)', () => {
  const confirmed = () => {
    const d = started()
    return stanjeView({
      ...d,
      lineup: {
        ...d.lineup,
        confirmed: true,
        canEdit: false,
        entries: [
          { memberId: '1', nickname: 'Ćići', role: 'crni_kralj' },
          { memberId: '2', nickname: 'Dado', role: 'crni' },
          { memberId: '5', nickname: 'Grgo', role: 'bili_kralj' },
          { memberId: '4', nickname: 'Mare', role: 'bula' },
        ],
      },
    })
  }

  it('counts the POSTAVA rather than the answers, in the head and in the bar', () => {
    const out = confirmed()
    // Bepo answered and is not in the postava; Grgo never answered and is.
    expect(out.columns[1]!.people.map((p) => p.nickname)).toEqual(['Grgo'])
    expect(out.columns[1]!.head).toBe('1')
    expect(out.armies).toMatchObject({ crni: 2, bili: 1 })
  })

  it('drops the "bez odgovora" chip, because the names ARE the number now', () => {
    const out = confirmed()
    expect(out.columns.flatMap((c) => c.people).some((p) => p.noAnswer)).toBe(false)
    expect(out.bule.some((p) => p.noAnswer)).toBe(false)
  })

  it('offers nothing to add: Otključaj is the way back in', () => {
    const out = confirmed()
    expect(out.columns[0]!.slots).toEqual([])
    expect(out.columns[0]!.addRow).toBeNull()
  })

  it('puts the titled names at the top of their column', () => {
    const out = confirmed()
    expect(out.columns[0]!.people.map((p) => p.nickname)).toEqual(['Ćići', 'Dado'])
  })
})

describe('stanjeView pickers (#620, widened by #633)', () => {
  it('offers everybody but the bula, that army first (#633)', () => {
    const out = stanjeView(withRoster())
    // Ćići and Dado stand in the crni column already; the picker still offers
    // the rest of the roster, because anybody may dance any role if the evening
    // needs it. Mare is the bula and is the one person left out.
    expect(out.pickers.crni.people.map((p) => p.nickname)).toEqual(['Bepo', 'Grgo'])
    expect(out.pickers.crni.people.every((p) => p.outsider)).toBe(true)

    // Bepo stands in the bili column. Dado and Grgo dance the bili, so they
    // come first; Ćići is the crni kralj and stands under the caption.
    expect(out.pickers.bili.people.map((p) => p.nickname)).toEqual(['Dado', 'Grgo', 'Ćići'])
    expect(out.pickers.bili.people.map((p) => p.outsider)).toEqual([false, false, true])
  })

  it('never offers a bula to an army, and never anybody else to the bula', () => {
    const out = stanjeView(withRoster())
    for (const key of ['crni', 'bili'] as const) {
      expect(out.pickers[key].people.map((p) => p.nickname)).not.toContain('Mare')
    }
    // Mare is the only bula and she is already in the card.
    expect(out.pickers.bula.people).toEqual([])
  })

  it('carries the real name for the search box and draws nothing with it (#633)', () => {
    const out = stanjeView(withRoster())
    expect(out.pickers.bili.people.find((p) => p.nickname === 'Dado')?.name).toBe('Damir Foretić')
  })

  it('offers any active moreškant as the voditelj, and hides nobody', () => {
    const d = withRoster()
    const out = stanjeView({
      ...d,
      performance: { ...d.performance, kind: 'experience' },
    })
    expect(out.pickers.voditelj.people.map((p) => p.nickname)).toEqual([
      'Bepo',
      'Ćići',
      'Dado',
      'Grgo',
      'Mare',
    ])
  })

  it('sinks somebody who said "ne dolazim" to the bottom rather than hiding them', () => {
    const d = withRoster()
    const out = stanjeView({
      ...d,
      count: { ...d.count, bili: { ...d.count.bili, count: 0, members: [] }, notComing: [BEPO] },
    })
    // Last of his own half, not of the whole list: the caption's group is
    // below him either way (#633).
    const own = out.pickers.bili.people.filter((p) => !p.outsider)
    expect(own.at(-1)!.nickname).toBe('Bepo')
    expect(own.at(-1)!.answer).toBe('not_coming')
  })

  it('names the role every row holds by definition, so it is not repeated', () => {
    const out = stanjeView(withRoster())
    expect(out.pickers.crni.omitRole).toBe('crni')
    expect(out.pickers.voditelj.omitRole).toBeNull()
  })

  it('offers only the roles somebody in front of you actually holds', () => {
    const out = stanjeView(withRoster())
    // Ćići is in this list since #633, so his crni_kralj is a filter now too.
    expect(rolesPresent(out.pickers.bili.people)).toEqual([
      'crni',
      'bili',
      'crni_kralj',
      'bili_kralj',
    ])
  })
})

describe('stanjeView and the voditelj of an Experience (#620)', () => {
  const experience = (
    entries: { memberId: string; nickname: string; role: 'voditelj' }[] = [],
  ) => {
    const d = withRoster()
    return stanjeView({
      ...d,
      performance: { ...d.performance, kind: 'experience' },
      lineup: { ...d.lineup, entries },
    })
  }

  it('has no voditelj at all on an ordinary moreška', () => {
    const out = stanjeView(withRoster())
    expect(out.experience).toBe(false)
    expect(out.voditelji).toEqual([])
    expect(out.requirements).toEqual({ titles: true, voditelj: false })
  })

  it('names him on an Experience, and asks for him instead of the four titles', () => {
    const out = experience([{ memberId: '2', nickname: 'Dado', role: 'voditelj' }])
    expect(out.experience).toBe(true)
    expect(out.voditelji.map((p) => p.nickname)).toEqual(['Dado'])
    expect(out.requirements).toEqual({ titles: false, voditelj: true })
    expect(out.canConfirm).toBe(true)
  })

  // #620 review — he stood in the crni column AND on his own card, was counted
  // in both, and then vanished from the column the moment Potvrdi turned the
  // count into the postava. The numbers jumped on the button that settles them.
  it('takes the voditelj out of the columns he answered into, and out of the count', () => {
    const d = withRoster()
    const out = stanjeView({
      ...d,
      performance: { ...d.performance, kind: 'experience' },
      lineup: {
        ...d.lineup,
        entries: [{ memberId: '1', nickname: 'Ćići', role: 'voditelj' }],
      },
    })
    // Ćići answered dolazim and stands among the crni in the fixture.
    expect(out.voditelji.map((p) => p.nickname)).toEqual(['Ćići'])
    expect(out.columns[0]!.people.map((p) => p.nickname)).toEqual(['Dado'])
    expect(out.columns[0]!.count).toBe(1)
    expect(out.armies.crni).toBe(1)
  })

  it('refuses to confirm an Experience nobody ran', () => {
    expect(experience().canConfirm).toBe(false)
  })

  it('refuses to confirm a moreška that is two titles short', () => {
    const out = stanjeView(withRoster())
    expect(out.titlesGiven).toBeLessThan(4)
    expect(out.canConfirm).toBe(false)
  })
})

describe('the reader\u2019s own answer and the numbers to ring (#624)', () => {
  it('offers the pair to a dancer on an evening that is still ahead', () => {
    const out = stanjeView(detail())
    expect(out.me).toEqual({ memberId: '1', answer: 'coming' })
  })

  it('offers it to nobody once the nastup can no longer be answered', () => {
    // The loader's own rule, the same one the hero reads and the route enforces
    // again: cancelled, or already started.
    const out = stanjeView(
      detail({ performance: { ...detail().performance, canAnswer: false } }),
    )
    expect(out.me).toBeNull()
  })

  it('offers it to nobody when the reader has no Member of their own', () => {
    // A voditelj who does not dance. There is nothing for him to answer.
    expect(stanjeView(detail({ myMemberId: null })).me).toBeNull()
  })

  // The Zaduženi lines (#658).
  it('names the keepers only when there are any, and never a voditelj', () => {
    // Nobody delegated: the voditelji are running the night, as always, and the
    // line is absent rather than empty.
    expect(stanjeView(detail()).keptBy).toBeNull()
    expect(stanjeView(detail()).listKeepers).toEqual([])

    const kept = stanjeView(
      detail({ listKeepers: [{ memberId: '7', nickname: 'Ante' }] }),
    )
    expect(kept.keptBy).toBe(APP_STRINGS.listKeepers.kept('Ante'))
    expect(kept.listKeepers).toEqual(['7'])
  })

  it('joins several keepers into one line', () => {
    const view = stanjeView(
      detail({
        listKeepers: [
          { memberId: '7', nickname: 'Ante' },
          { memberId: '9', nickname: 'Bepo' },
        ],
      }),
    )
    expect(view.keptBy).toBe(APP_STRINGS.listKeepers.kept('Ante, Bepo'))
  })

  it('signs a confirmed postava, and signs nothing otherwise', () => {
    const base = detail()
    const signed = (over: Partial<PerformanceDetail['lineup']>) =>
      stanjeView(detail({ lineup: { ...base.lineup, ...over } })).confirmedBy

    expect(
      signed({ confirmed: true, confirmedAt: '2026-08-20T21:00:00.000Z', confirmedBy: 'Ante' }),
    ).toContain('Ante')
    // Unconfirmed, and confirmed by nobody the row remembers: no line either way.
    expect(signed({ confirmed: false, confirmedBy: 'Ante' })).toBeNull()
    expect(signed({ confirmed: true, confirmedAt: '2026-08-20T21:00:00.000Z' })).toBeNull()
  })

  it('carries a mobile for whoever keeps the list, and for nobody else', () => {
    const roster = [{ ...CICI, mobile: '0915551234' }]
    const withPhones = (over: Partial<PerformanceDetail>) =>
      stanjeView(
        detail({
          ...over,
          count: {
            ...detail().count,
            crni: { count: 1, threshold: 3, below: true, nicknames: [], members: roster },
          },
        }),
      ).columns[0].people.find((p) => p.memberId === '1')?.mobile ?? null

    expect(withPhones({ voditelj: true, keepsList: true })).toBe('0915551234')
    // A Zaduženi is the person ringing round at seven in the evening (#658), so
    // the numbers follow `keepsList` rather than the permission.
    expect(withPhones({ voditelj: false, keepsList: true })).toBe('0915551234')
    // Any other dancer's browser never receives it: the Nazovi row belongs to
    // whoever is running the night, so the number is left out of the payload
    // rather than hidden in the CSS.
    expect(withPhones({ voditelj: false, keepsList: false })).toBeNull()
  })
})
