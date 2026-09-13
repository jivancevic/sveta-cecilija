import { describe, expect, it } from 'vitest'
import {
  aheadLabel,
  answerChip,
  armyLabel,
  heroView,
  identityOf,
  monthSections,
  nastupRow,
  nastupTitle,
} from './moreska-screen'
import { groupByMonth, type RosterPerformance } from './roster-loaders'

// #565 — what Moreška says. The two rules that matter are asserted about the
// VALUES the page renders, not about markup: a non-regular evening never names
// its client, and every counted noun is in the dancer's register.

const performance = (over: Partial<RosterPerformance> = {}): RosterPerformance => ({
  id: '10',
  date: '2026-09-14',
  time: '21:00',
  kind: 'redovna',
  isPublic: true,
  venue: 'ljetno-kino',
  location: null,
  client: null,
  cancelled: false,
  voditeljNote: null,
  startMs: Date.parse('2026-09-14T19:00:00.000Z'),
  thresholdCrni: 8,
  thresholdBili: 8,
  myAnswer: null,
  myArmy: null,
  lineupConfirmed: false,
  canAnswer: true,
  chip: null,
  ...over,
})

const booking = (over: Partial<RosterPerformance> = {}) =>
  performance({
    id: '11',
    kind: 'dmc',
    isPublic: false,
    venue: null,
    location: 'Luka',
    client: 'Le Ponant',
    time: '10:00',
    ...over,
  })

describe('nastupTitle', () => {
  it('names a Redovna and nothing else by name', () => {
    expect(nastupTitle({ kind: 'redovna' })).toBe('Redovna')
  })

  // Q30: the client is the voditelj's business and lives on Izvedbe. A dancer
  // reads one word, the one the notebook has always used.
  it.each(['dmc', 'gulliver', 'koncert', 'experience', 'ostalo'])(
    'calls a %s evening Vanredna',
    (kind) => {
      expect(nastupTitle({ kind })).toBe('Vanredna')
    },
  )
})

describe('nastupRow', () => {
  it('never prints the client or the kind name of a booking', () => {
    const row = nastupRow(booking(), { showAnswer: true })
    expect(row.title).toBe('Vanredna')
    expect(row.meta).toBe('10:00 · Luka')
    expect(JSON.stringify(row)).not.toContain('Le Ponant')
    expect(JSON.stringify(row)).not.toContain('Adriatic DMC')
    expect(row.gold).toBe(false)
  })

  it('gives a Redovna the gold disc, the venue label and the day', () => {
    const row = nastupRow(performance(), { showAnswer: true })
    expect(row).toMatchObject({
      day: '14',
      weekday: 'pon',
      gold: true,
      title: 'Redovna',
      meta: '21:00 · Ljetno kino',
    })
  })

  it('says an evening is off in the meta line rather than dropping it', () => {
    const row = nastupRow(performance({ cancelled: true }), { showAnswer: true })
    expect(row.cancelled).toBe(true)
    expect(row.meta).toContain('otkazano')
  })

  it('carries no chip for a reader with no Member row', () => {
    expect(nastupRow(performance(), { showAnswer: false }).chip).toBeNull()
  })

  it('links into Stanje, which is the performance detail until #566', () => {
    expect(nastupRow(performance(), { showAnswer: true }).href).toBe('/app/performances/10')
  })
})

describe('answerChip', () => {
  it('says which of the three states the reader is in, in the dancer’s register', () => {
    expect(answerChip('coming')).toEqual({ label: 'dolaziš', tone: 'gold' })
    expect(answerChip('not_coming')).toEqual({ label: 'ne dolaziš', tone: 'plain' })
    expect(answerChip(null)).toEqual({ label: 'bez odgovora', tone: 'plain' })
  })
})

describe('monthSections', () => {
  it('counts nastupi, and never counts a cancelled evening among them', () => {
    const rows = [
      performance({ id: '1', date: '2026-09-14' }),
      performance({ id: '2', date: '2026-09-16', cancelled: true }),
      performance({ id: '3', date: '2026-10-02' }),
    ]
    const sections = monthSections(groupByMonth(rows), { showAnswer: true })
    expect(sections.map((s) => [s.label, s.aside, s.rows.length])).toEqual([
      ['Rujan', '1 nastup', 2],
      ['Listopad', '1 nastup', 1],
    ])
  })

  it('declines the count the way Croatian does', () => {
    const many = (n: number) =>
      monthSections(
        groupByMonth(
          Array.from({ length: n }, (_, i) =>
            performance({ id: String(i), date: `2026-09-${String(i + 1).padStart(2, '0')}` }),
          ),
        ),
        { showAnswer: true },
      )[0]!.aside
    expect(many(1)).toBe('1 nastup')
    expect(many(3)).toBe('3 nastupa')
    expect(many(12)).toBe('12 nastupa')
  })
})

describe('aheadLabel', () => {
  it('counts what is still going to happen, not what is on the list', () => {
    expect(
      aheadLabel([
        performance({ id: '1' }),
        performance({ id: '2', cancelled: true }),
        performance({ id: '3' }),
      ]),
    ).toBe('2 nastupa pred tobom')
    expect(aheadLabel([performance()])).toBe('1 nastup pred tobom')
    expect(aheadLabel([])).toBe('0 nastupa pred tobom')
  })
})

describe('identityOf', () => {
  it('marks a crni kralj with the ink disc and the crown', () => {
    expect(
      identityOf(
        {
          id: '1',
          name: 'Josip Ivančević',
          nickname: 'Cici',
          roles: ['crni', 'crni_kralj'],
          primaryRole: 'crni_kralj',
        },
        '9 nastupa pred tobom',
      ),
    ).toEqual({
      name: 'Josip Ivančević',
      line: 'Crni kralj · 9 nastupa pred tobom',
      army: 'crni',
      title: 'crni_kralj',
    })
  })

  it('puts a bula on the gold disc, which is neither army', () => {
    const out = identityOf(
      { id: '2', name: 'Ana', roles: ['bula'], primaryRole: 'bula' },
      '3 nastupa pred tobom',
    )
    expect(out).toMatchObject({ army: 'bula', title: 'bula', line: 'Bula · 3 nastupa pred tobom' })
  })

  it('gives a plain bili no title glyph', () => {
    expect(
      identityOf({ id: '3', name: 'Ivo', roles: ['bili'], primaryRole: 'bili' }, '1 nastup pred tobom'),
    ).toMatchObject({ army: 'bili', title: null })
  })

  it('falls back to the nickname when the row carries no legal name', () => {
    expect(
      identityOf({ id: '4', name: null, nickname: 'Cici', roles: ['crni'], primaryRole: 'crni' }, ''),
    ).toMatchObject({ name: 'Cici', line: 'Crni' })
  })

  it('is null for a voditelj who does not dance', () => {
    expect(identityOf(null, '5 nastupa pred tobom')).toBeNull()
  })
})

describe('heroView', () => {
  it('splits the date into the big day and the genitive month', () => {
    expect(heroView(performance())).toMatchObject({
      eyebrow: 'Sljedeći nastup · Ljetno kino',
      day: '14',
      month: 'rujna',
      meta: 'Ponedjeljak · 21:00 · Redovna',
      href: '/app/performances/10',
      armies: null,
    })
  })

  it('names a booking Vanredna in the meta line too, and its place in the eyebrow', () => {
    expect(heroView(booking())).toMatchObject({
      eyebrow: 'Sljedeći nastup · Luka',
      meta: 'Ponedjeljak · 10:00 · Vanredna',
    })
  })

  it('hands the ArmyBar the counts and the evening’s own thresholds', () => {
    const out = heroView(
      performance({
        chip: {
          crni: { count: 7, threshold: 8, below: true },
          bili: { count: 9, threshold: 6, below: false },
        },
      }),
    )
    expect(out.armies).toEqual({ crni: 7, bili: 9, threshold: { crni: 8, bili: 6 } })
  })
})

describe('armyLabel', () => {
  it('names the army a landed answer counted in, and nothing for a bula', () => {
    expect(armyLabel('crni')).toBe('Crni')
    expect(armyLabel('bili')).toBe('Bili')
    expect(armyLabel(null)).toBeNull()
  })
})
