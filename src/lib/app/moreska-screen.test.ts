import { describe, expect, it } from 'vitest'
import {
  aheadLabel,
  armyLabel,
  heroView,
  identityOf,
  monthSections,
  nastupRow,
  soonLabel,
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

  it('offers no answer on the half of the list nobody answers', () => {
    const row = nastupRow(performance(), { showAnswer: false })
    expect(row.answer).toBeNull()
    expect(row.canAnswer).toBe(false)
  })

  it('links into Stanje, which is the performance detail until #566', () => {
    expect(nastupRow(performance(), { showAnswer: true }).href).toBe('/app/moreska/10')
  })
})

describe('soonLabel', () => {
  it('says the word a dancer would say, inside the week', () => {
    expect(soonLabel(0)).toBe('danas')
    expect(soonLabel(1)).toBe('sutra')
    expect(soonLabel(2)).toBe('za 2 dana')
    expect(soonLabel(5)).toBe('za 5 dana')
    expect(soonLabel(7)).toBe('za 7 dana')
  })

  it('stops at a week, and never counts backwards', () => {
    expect(soonLabel(8)).toBeNull()
    expect(soonLabel(40)).toBeNull()
    expect(soonLabel(-1)).toBeNull()
    expect(soonLabel(null)).toBeNull()
  })
})

describe('nastupRow · the countdown chip (#612)', () => {
  it('counts CALENDAR days, so a late-night today still reads sutra tomorrow', () => {
    // The difference is computed off two Zagreb calendar days, never off hours:
    // at 23:50 on the 14th, the 15th's 21:00 nastup is 21 hours away and a
    // 24-hour bucket would have called it "danas".
    const row = nastupRow(performance({ date: '2026-09-15' }), {
      showAnswer: true,
      today: '2026-09-14',
    })
    expect(row.soon).toBe('sutra')
  })

  it('says danas on the day itself and nothing past the week', () => {
    const on = (date: string) =>
      nastupRow(performance({ date }), { showAnswer: true, today: '2026-09-14' }).soon
    expect(on('2026-09-14')).toBe('danas')
    expect(on('2026-09-17')).toBe('za 3 dana')
    expect(on('2026-09-21')).toBe('za 7 dana')
    expect(on('2026-09-22')).toBeNull()
  })

  it('never counts down to an evening that is off', () => {
    const row = nastupRow(performance({ date: '2026-09-15', cancelled: true }), {
      showAnswer: true,
      today: '2026-09-14',
    })
    expect(row.soon).toBeNull()
  })

  it('says nothing at all when the caller hands over no day, which is the past list', () => {
    expect(nastupRow(performance(), { showAnswer: false }).soon).toBeNull()
  })

  it('carries whether the postava was confirmed, for the past list POPIS chip', () => {
    expect(nastupRow(performance({ lineupConfirmed: true }), { showAnswer: false }).lineupConfirmed)
      .toBe(true)
    expect(nastupRow(performance(), { showAnswer: false }).lineupConfirmed).toBe(false)
  })
})

describe('the row’s own answer (#624)', () => {
  it('carries the reader’s answer rather than a word for it', () => {
    expect(nastupRow(performance({ myAnswer: 'coming' }), { showAnswer: true }).answer).toBe(
      'coming',
    )
    expect(nastupRow(performance({ myAnswer: null }), { showAnswer: true }).answer).toBeNull()
  })

  it('lets the circles be tapped only where the loader says they may be', () => {
    expect(nastupRow(performance(), { showAnswer: true }).canAnswer).toBe(true)
    expect(nastupRow(performance({ canAnswer: false }), { showAnswer: true }).canAnswer).toBe(
      false,
    )
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
  // #612: the identity block is a PROFILE, so its mark answers "who is this
  // person". The disc is the army of the primary role and the GLYPH is that
  // role; the evening's title is drawn where a person is shown IN an evening
  // (the hero, Stanje), which is the split `RoleMark`'s two contexts exist for.
  // The glossary is untouched: a titula still lives in a lineup, not on a
  // Member row, and nothing here reads one.
  it('gives a crni kralj the ink disc AND his own role, with the rest beside it', () => {
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
      primaryRole: 'crni_kralj',
      others: [{ role: 'crni', army: 'crni', label: 'Crni' }],
    })
  })

  it('puts a bula on the gold disc, which is neither army', () => {
    const out = identityOf(
      { id: '2', name: 'Ana', roles: ['bula'], primaryRole: 'bula' },
      '3 nastupa pred tobom',
    )
    expect(out).toMatchObject({
      army: 'bula',
      primaryRole: 'bula',
      others: [],
      line: 'Bula · 3 nastupa pred tobom',
    })
  })

  it('never repeats the primary role among the small discs', () => {
    for (const primaryRole of ['crni', 'bili', 'crni_kralj', 'bili_kralj', 'otmanovic', 'bula']) {
      const out = identityOf(
        { id: '3', name: 'Ivo', roles: [primaryRole], primaryRole },
        '1 nastup pred tobom',
      )
      expect(out?.primaryRole).toBe(primaryRole)
      expect(out?.others).toEqual([])
    }
  })

  it("shows EVERY other role, in the profile form's own order, with its OWN army", () => {
    const out = identityOf(
      {
        id: '5',
        name: 'Marin',
        // Deliberately out of order and with a duplicate: `roles` arrives raw
        // off a Member row, and neither slip may reach the screen.
        roles: ['bula', 'crni_kralj', 'crni', 'crni', 'otmanovic'],
        primaryRole: 'crni',
      },
      '',
    )
    expect(out?.others).toEqual([
      { role: 'crni_kralj', army: 'crni', label: 'Crni kralj' },
      { role: 'otmanovic', army: 'crni', label: 'Otmanović' },
      { role: 'bula', army: 'bula', label: 'Bula' },
    ])
  })

  it('ignores a role the vocabulary does not know', () => {
    const out = identityOf(
      { id: '6', name: 'Ive', roles: ['crni', 'kapetan'], primaryRole: 'crni' },
      '',
    )
    expect(out?.others).toEqual([])
  })

  it('has no primary role, and so no glyph, when the row carries none', () => {
    const out = identityOf({ id: '7', name: 'Duje', roles: [], primaryRole: null }, '')
    expect(out?.primaryRole).toBeNull()
    expect(out?.army).toBeNull()
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

  describe('DANAS (#612)', () => {
    // Decided on the SERVER, against the Europe/Zagreb day the loader already
    // holds: a phone in Vienna and a phone in Korčula disagree about the date
    // for an hour a night, and a card that changed its whole treatment on
    // hydration would be the visible form of that disagreement.
    it('labels the card when its evening is today, and not when it is not', () => {
      expect(heroView(solo(performance()), { today: '2026-09-14' }).todayLabel).toBe('DANAS')
      expect(heroView(solo(performance()), { today: '2026-09-13' }).todayLabel).toBeNull()
      expect(heroView(solo(performance()), { today: '2026-09-15' }).todayLabel).toBeNull()
    })

    it('decides nothing when it is handed no day', () => {
      expect(heroView(solo(performance())).todayLabel).toBeNull()
      expect(heroView(solo(performance()), { today: null }).todayLabel).toBeNull()
    })

    it('follows the DAY on a split, because both halves are on it', () => {
      const out = heroView(
        {
          first: performance({ id: '1', time: '10:00' }),
          second: performance({ id: '2', time: '21:00' }),
          moreCount: 0,
        },
        { today: '2026-09-14' },
      )
      expect(out.halves).toHaveLength(2)
      expect(out.todayLabel).toBe('DANAS')
    })
  })

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

    it('names the whole day in one eyebrow and drops the single evening’s meta line', () => {
      const out = heroView(split)
      // The head of a split card is this line and nothing else (#592): the
      // date is in it, so the big serif date is not drawn above the halves.
      expect(out.eyebrow).toBe('Sljedeći nastupi · 14. rujna · Ponedjeljak')
      expect(out.day).toBe('14')
      expect(out.meta).toBe('Ponedjeljak')
      // No chip on the shared line either: each half names its own kind (#592).
      expect(out.metaLead).toBe('Ponedjeljak')
      expect(out.kind).toBeNull()
    })

    it('gives each half its own time, word and answer, and no place', () => {
      const halves = heroView(split).halves
      expect(halves).toHaveLength(2)
      expect(halves?.[0]).toMatchObject({
        id: '10',
        time: '21:00',
        title: 'Redovna',
        tone: 'regular',
        answer: null,
        href: '/app/moreska/10',
      })
      // The house is NOT on a half (#592): the chip stands alone on its line,
      // and the house is one tap away on the row the time links to.
      expect(halves?.[0]).not.toHaveProperty('place')
      expect(halves?.[1]).toMatchObject({
        id: '11',
        time: '10:00',
        title: 'Experience',
        tone: 'experience',
        answer: 'coming',
        army: 'Crni',
        armies: { crni: 7, bili: 5 },
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
