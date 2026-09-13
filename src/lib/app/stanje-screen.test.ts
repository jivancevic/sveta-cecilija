import { describe, expect, it } from 'vitest'
import { effectiveLineup, stanjeView } from './stanje-screen'
import type { PerformanceDetail } from './detail-loaders'
import type { RosterPerson } from '@/lib/attendance/army-count'

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
    },
    count: {
      crni: { count: 2, threshold: 3, below: true, nicknames: [], members: [CICI, DADO] },
      bili: { count: 1, threshold: 2, below: true, nicknames: [], members: [BEPO] },
      bula: [MARE],
      notComing: [],
      noAnswer: [GRGO],
    },
    voditelj: true,
    canEditOthers: true,
    canAlarm: true,
    moveTargets: { '2': ['crni', 'bili'] },
    myMemberId: '1',
    lineup: {
      confirmed: false,
      confirmedAt: null,
      entries: [],
      suggested: [
        { memberId: '1', nickname: 'Ćići', role: 'crni' },
        { memberId: '2', nickname: 'Dado', role: 'crni' },
        { memberId: '3', nickname: 'Bepo', role: 'bili' },
        { memberId: '4', nickname: 'Mare', role: 'bula' },
      ],
      warnings: [],
      roster: [],
      visible: true,
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
})

describe('stanjeView columns', () => {
  it('puts crni first and bili second, each against its own threshold', () => {
    const [crni, bili] = stanjeView(detail()).columns
    expect(crni).toMatchObject({ army: 'crni', head: '2 od 3', below: true })
    expect(bili).toMatchObject({ army: 'bili', head: '1 od 2', below: true })
    expect(crni!.people.map((p) => p.nickname)).toEqual(['Ćići', 'Dado'])
  })

  it('draws one place per dancer still missing, numbered from the next one', () => {
    const [crni, bili] = stanjeView(detail()).columns
    expect(crni!.slots).toEqual(['mjesto 3'])
    expect(bili!.slots).toEqual(['mjesto 2'])
  })

  it('draws no places once an army is at or over its threshold', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      count: {
        ...d.count,
        crni: { count: 4, threshold: 3, below: false, nicknames: [], members: [CICI, DADO] },
      },
    })
    expect(out.columns[0]!.slots).toEqual([])
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
    expect(bili.people.map((p) => p.nickname)).toEqual(['Bepo', 'Grgo'])
    expect(bili.people[1]).toMatchObject({
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
  const asDancer = () => {
    const d = detail()
    return stanjeView({
      ...d,
      voditelj: false,
      canEditOthers: false,
      moveTargets: {},
      lineup: { ...d.lineup, suggested: [], visible: false, canEdit: false },
    })
  }

  it('shows no titles at all while the postava is a draft', () => {
    // The loader empties a draft before it reaches this module (story 34), so
    // there is nothing to leak: every name is plain and the tally is zero.
    const out = asDancer()
    expect(out.columns.flatMap((c) => c.people).every((p) => p.title === null)).toBe(true)
    expect(out.titlesGiven).toBe(0)
    expect(out.lineup).toEqual([])
  })

  it('shows the titles once the postava is confirmed', () => {
    const d = detail()
    const out = stanjeView({
      ...d,
      voditelj: false,
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
