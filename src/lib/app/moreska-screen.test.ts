import { describe, expect, it } from 'vitest'
import {
  aheadLabel,
  answerChip,
  armyLabel,
  heroView,
  identityOf,
  monthSections,
  nastupRow,
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
  myTitle: null,
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

describe('nastupRow', () => {
  it('never prints the client or the kind name of a booking', () => {
    const row = nastupRow(booking(), { showAnswer: true })
    expect(row.title).toBe('Vanredna')
    expect(row.meta).toBe('10:00 · Luka')
    expect(JSON.stringify(row)).not.toContain('Le Ponant')
    expect(JSON.stringify(row)).not.toContain('Adriatic DMC')
    expect(row.tone).toBe('extra')
  })

  it('reads an Experience as its own category, copper rather than sunk (#591)', () => {
    const row = nastupRow(booking({ kind: 'experience' }), { showAnswer: true })
    expect(row.title).toBe('Experience')
    expect(row.tone).toBe('experience')
  })

  it('gives a Redovna the gold disc, the venue label and the day', () => {
    const row = nastupRow(performance(), { showAnswer: true })
    expect(row).toMatchObject({
      day: '14',
      weekday: 'pon',
      tone: 'regular',
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
    expect(nastupRow(performance(), { showAnswer: true }).href).toBe('/app/moreska/10')
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
  // Q65 and the glossary's *Title*: a title belongs to one evening's lineup,
  // never to a person, so nobody wears a crown on the screen's own top block.
  // The profile's primary role survives as the WORD beside the mark.
  it('gives a crni kralj the ink disc and NO crown', () => {
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
      title: null,
    })
  })

  it('puts a bula on the gold disc, which is neither army, and still untitled', () => {
    // The white ring that marks the bula OF THE NIGHT is a lineup fact too, so
    // it is not drawn from a profile whose primary role happens to be `bula`.
    const out = identityOf(
      { id: '2', name: 'Ana', roles: ['bula'], primaryRole: 'bula' },
      '3 nastupa pred tobom',
    )
    expect(out).toMatchObject({ army: 'bula', title: null, line: 'Bula · 3 nastupa pred tobom' })
  })

  it('never carries a title, whatever the primary role says', () => {
    for (const primaryRole of ['crni', 'bili', 'crni_kralj', 'bili_kralj', 'otmanovic', 'bula']) {
      expect(
        identityOf({ id: '3', name: 'Ivo', roles: [primaryRole], primaryRole }, '1 nastup pred tobom')
          ?.title,
      ).toBeNull()
    }
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
  /** One evening, as the hero loader hands it over. */
  const solo = (p: RosterPerformance) => ({ first: p, second: null, moreCount: 0 })

  it('splits the date into the big day and the genitive month', () => {
    expect(heroView(solo(performance()))).toMatchObject({
      eyebrow: 'Sljedeći nastup · Ljetno kino',
      day: '14',
      month: 'rujna',
      meta: 'Ponedjeljak · 21:00 · Redovna',
      // The hero draws the kind as a chip, so it needs the two halves apart
      // (#592). `meta` stays the whole sentence for anything that wants one.
      metaLead: 'Ponedjeljak · 21:00',
      kind: 'Redovna',
      href: '/app/moreska/10',
      tone: 'regular',
      armies: null,
    })
  })

  it('names a booking Vanredna in the meta line too, and its place in the eyebrow', () => {
    expect(heroView(solo(booking()))).toMatchObject({
      eyebrow: 'Sljedeći nastup · Luka',
      meta: 'Ponedjeljak · 10:00 · Vanredna',
      tone: 'extra',
    })
  })

  it('names an Experience by its own word and carries its own tone (#591)', () => {
    expect(heroView(solo(booking({ kind: 'experience' })))).toMatchObject({
      meta: 'Ponedjeljak · 10:00 · Experience',
      tone: 'experience',
    })
  })

  it('hands the ArmyBar the counts and the evening’s own thresholds', () => {
    const out = heroView(
      solo(
        performance({
          chip: {
            crni: { count: 7, threshold: 8, below: true },
            bili: { count: 9, threshold: 6, below: false },
          },
        }),
      ),
    )
    expect(out.armies).toEqual({ crni: 7, bili: 9, threshold: { crni: 8, bili: 6 } })
  })

  it('carries no halves and no "more" line for an ordinary single evening', () => {
    const out = heroView(solo(performance()))
    expect(out.halves).toBeNull()
    expect(out.moreLabel).toBeNull()
  })

  // #591: a day with two nastupa on it is one card with two answers in it.
  describe('two on one day', () => {
    const morning = booking({
      id: '11',
      kind: 'experience',
      time: '10:00',
      location: 'Prostor Sv. Cecilije',
      myAnswer: 'coming',
      myArmy: 'crni',
      chip: {
        crni: { count: 7, threshold: 8, below: true },
        bili: { count: 5, threshold: 8, below: true },
      },
    })
    const evening = performance()
    const split = { first: evening, second: morning, moreCount: 0 }

    it('names the day in the plural and drops the single evening’s meta line', () => {
      const out = heroView(split)
      expect(out.eyebrow).toBe('Sljedeći nastupi')
      // The date stays shared and big; the times live in the halves.
      expect(out.day).toBe('14')
      expect(out.meta).toBe('Ponedjeljak')
      // No chip on the shared line either: each half names its own kind (#592).
      expect(out.metaLead).toBe('Ponedjeljak')
      expect(out.kind).toBeNull()
    })

    it('gives each half its own time, word, place and answer', () => {
      const halves = heroView(split).halves
      expect(halves).toHaveLength(2)
      expect(halves?.[0]).toMatchObject({
        id: '10',
        time: '21:00',
        title: 'Redovna',
        tone: 'regular',
        place: 'Ljetno kino',
        answer: null,
        href: '/app/moreska/10',
      })
      expect(halves?.[1]).toMatchObject({
        id: '11',
        time: '10:00',
        title: 'Experience',
        tone: 'experience',
        place: 'Prostor Sv. Cecilije',
        answer: 'coming',
        army: 'Crni',
        armiesLine: 'crni 7 · bili 5',
        href: '/app/moreska/11',
      })
    })

    it('drops the ArmyBar: a bar is one evening’s, and two under one date is a chart', () => {
      const out = heroView({
        first: performance({
          chip: {
            crni: { count: 7, threshold: 8, below: true },
            bili: { count: 9, threshold: 6, below: false },
          },
        }),
        second: morning,
        moreCount: 0,
      })
      expect(out.armies).toBeNull()
    })

    it('counts the rest of the day in Croatian, singular and plural', () => {
      expect(heroView({ ...split, moreCount: 1 }).moreLabel).toBe('još 1 nastup taj dan ›')
      expect(heroView({ ...split, moreCount: 2 }).moreLabel).toBe('još 2 nastupa taj dan ›')
      expect(heroView({ ...split, moreCount: 5 }).moreLabel).toBe('još 5 nastupa taj dan ›')
    })
  })
})

describe('armyLabel', () => {
  it('names the army a landed answer counted in, and nothing for a bula', () => {
    expect(armyLabel('crni')).toBe('Crni')
    expect(armyLabel('bili')).toBe('Bili')
    expect(armyLabel(null)).toBeNull()
  })
})
