import { describe, expect, it } from 'vitest'
import type { Permission } from '@/lib/access/permissions'
import { appNav, type AppNav } from './screens'
import { APP_STRINGS } from './strings'
import {
  MAX_HOME_CARDS,
  compCard,
  dayPart,
  daysBetween,
  financeCard,
  firstNameOf,
  greetingLine,
  homeCardKeys,
  inboxCard,
  inquiriesCard,
  leaderboardCard,
  membersCard,
  moreskaEmptyCard,
  nextSentence,
  ordersCard,
  performancesCard,
  registerFor,
  scanCard,
  sellCard,
  statementCard,
  statsCard,
  usersCard,
  zagrebHour,
  zagrebToday,
} from './home-screen'

// Početna's rules (#564). Pure throughout, so every one of them is a table.
//
// The three that are decisions rather than formatting:
//
//   - the cards ARE the bar, minus its two fixed ends, plus Obavijesti;
//   - the greeting names a person or says nothing at all;
//   - the sentence is in the reader's own register (CONTEXT.md).

const user = (...permissions: Permission[]) => ({ permissions })
const ctx = (over: { hasMember?: boolean; hasPartner?: boolean } = {}) => ({
  hasMember: over.hasMember ?? false,
  hasPartner: over.hasPartner ?? false,
})

/** 21:00 Europe/Zagreb on a Sunday in September (CEST, UTC+2). */
const EVENING = Date.parse('2026-09-13T19:00:00.000Z')
/** 08:15 Zagreb the same day. */
const MORNING = Date.parse('2026-09-13T06:15:00.000Z')

describe('homeCardKeys', () => {
  it('is the account’s bar without its two fixed ends, then Obavijesti', () => {
    const nav = appNav(user('tickets'), ctx(), ['orders', 'stats', 'inquiries'])
    expect(nav.tabs.map((t) => t.key)).toEqual(['home', 'orders', 'stats', 'inquiries', 'more'])
    expect(homeCardKeys(nav)).toEqual(['orders', 'stats', 'inquiries', 'notifications'])
  })

  it('never draws a card for a screen the account does not unlock', () => {
    // A partner holds two screens and nothing else, so there is no orders card
    // to leave out: the bar already answered the access question (#563).
    const nav = appNav(user('partner'), { hasMember: false, hasPartner: true })
    expect(homeCardKeys(nav)).toEqual(['sell', 'statement', 'notifications'])
  })

  it('gives a dancer the dance first, as their bar does (#565)', () => {
    const nav = appNav(user('moreskant'), ctx({ hasMember: true }))
    expect(homeCardKeys(nav)).toEqual(['moreska', 'leaderboard', 'notifications'])
  })

  it('caps at four, so Obavijesti can never push a fifth card on', () => {
    const nav = appNav(user('tickets'), ctx(), ['orders', 'stats', 'inquiries'])
    expect(homeCardKeys(nav).length).toBe(MAX_HOME_CARDS)
  })

  it('gives the two shared logins the one screen each of them holds', () => {
    // `tehnika` is the door's phone (ADR-0022) and `member` the society's
    // season. Their passwords are on a wall and in a WhatsApp group, so this is
    // where their card set is asserted rather than in a browser.
    expect(homeCardKeys(appNav(user('door'), ctx()))).toEqual(['scan', 'notifications'])
    expect(homeCardKeys(appNav(user('season_stats'), ctx()))).toEqual([
      'stats',
      'notifications',
    ])
  })

  it('gives a voditelj the dance, the roster and the schedule', () => {
    expect(homeCardKeys(appNav(user('moreska'), ctx()))).toEqual([
      'moreska',
      'members',
      'performances',
      'notifications',
    ])
  })

  it('gives a finance holder the euros card and the counts card', () => {
    expect(homeCardKeys(appNav(user('finance'), ctx()))).toEqual([
      'finance',
      'stats',
      'notifications',
    ])
  })

  it('is only Obavijesti for an account with no bar at all', () => {
    expect(homeCardKeys({ tabs: [], overflow: [], landing: null, groups: [] } as AppNav)).toEqual([
      'notifications',
    ])
  })
})

describe('the greeting', () => {
  it('turns over at 4, at 10 and at 18, so the evening starts before the moreška does', () => {
    // 01:00 is the walk home from a nastup, not the next morning.
    expect(dayPart(0)).toBe('evening')
    expect(dayPart(1)).toBe('evening')
    expect(dayPart(4)).toBe('morning')
    expect(dayPart(9)).toBe('morning')
    expect(dayPart(10)).toBe('afternoon')
    expect(dayPart(17)).toBe('afternoon')
    expect(dayPart(18)).toBe('evening')
    expect(dayPart(23)).toBe('evening')
  })

  it('reads the Zagreb wall clock, not the server’s', () => {
    // The box is in Nuremberg and answers in UTC; 19:00 UTC is 21:00 in Korčula.
    expect(zagrebHour(EVENING)).toBe(21)
    expect(zagrebHour(MORNING)).toBe(8)
    expect(zagrebToday(EVENING)).toBe('2026-09-13')
    // 23:30 UTC is already tomorrow in Zagreb, and the sentence has to agree.
    expect(zagrebToday(Date.parse('2026-09-13T23:30:00.000Z'))).toBe('2026-09-14')
  })

  it('takes the first token of the Member’s name, then of the account’s', () => {
    expect(firstNameOf({ memberName: 'Josip Ivančević' })).toBe('Josip')
    expect(firstNameOf({ memberName: null, accountName: 'Tatjana Šeparović' })).toBe('Tatjana')
    expect(firstNameOf({ memberName: '  Luka  Brkić ' })).toBe('Luka')
  })

  it('has no name for a shared login, and never falls back to a username', () => {
    // `tehnika` and `member` carry neither a Member nor a `name` (ADR-0022,
    // #510), and the username is a room rather than a person.
    expect(firstNameOf({})).toBeNull()
    expect(firstNameOf({ memberName: '', accountName: '   ' })).toBeNull()
  })

  it('says nothing at all to a shared login, and the hour to a nameless one', () => {
    // A greeting is addressed to a person: `tehnika` is a phone by the gate.
    expect(greetingLine({ nowMs: EVENING, firstName: null, shared: true })).toBeNull()
    expect(greetingLine({ nowMs: EVENING, firstName: 'Josip', shared: true })).toBeNull()
    // A named account whose `name` nobody filled in still gets the time of day,
    // which is true of everybody, rather than a blank where a sentence goes.
    expect(greetingLine({ nowMs: EVENING, firstName: null })).toBe('Dobra večer.')
  })

  it('greets without a vocative', () => {
    expect(greetingLine({ nowMs: EVENING, firstName: 'Josip' })).toBe('Dobra večer, Josip.')
    expect(greetingLine({ nowMs: MORNING, firstName: 'Josip' })).toBe('Dobro jutro, Josip.')
  })
})

describe('the sentence about the next evening', () => {
  const today = '2026-09-13'

  it('is in the dancer’s register for anybody on the roster', () => {
    expect(registerFor(['moreskant'])).toBe('nastup')
    expect(registerFor(['moreska', 'tickets'])).toBe('nastup')
    expect(registerFor(['tickets', 'refunds'])).toBe('izvedba')
    expect(registerFor(['door'])).toBe('izvedba')
    expect(registerFor(['season_stats'])).toBe('izvedba')
  })

  it('says danas, sutra, the weekday after "u", then a date', () => {
    const s = (date: string) => nextSentence({ date, today, register: 'nastup' })
    expect(s('2026-09-13')).toBe('Danas je nastup.')
    expect(s('2026-09-14')).toBe('Sutra je nastup.')
    // 16 September 2026 is a Wednesday: "u srijedu", not "u srijeda".
    expect(s('2026-09-16')).toBe('Nastup je u srijedu.')
    expect(s('2026-09-19')).toBe('Nastup je u subotu.')
    // A week out, a weekday would name the wrong one, so it is a date.
    expect(s('2026-09-21')).toBe('Sljedeći nastup je 21. rujna.')
  })

  it('says the same thing in the selling register', () => {
    const s = (date: string) => nextSentence({ date, today, register: 'izvedba' })
    expect(s('2026-09-13')).toBe('Danas je izvedba.')
    expect(s('2026-09-14')).toBe('Sutra je izvedba.')
    expect(s('2026-09-18')).toBe('Izvedba je u petak.')
    expect(s('2026-10-01')).toBe('Sljedeća izvedba je 1. listopada.')
  })

  it('says nothing at all when the schedule is empty', () => {
    expect(nextSentence({ date: null, today, register: 'nastup' })).toBeNull()
    expect(nextSentence({ date: 'not-a-date', today, register: 'nastup' })).toBeNull()
  })

  it('counts calendar days, so a DST change cannot move an evening', () => {
    // 25 October 2026 is the night the clocks go back in Zagreb.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('the figure cards', () => {
  it('counts orders for the next evening, and says which question it answered', () => {
    expect(ordersCard({ count: 17, forNextShow: true })).toMatchObject({
      figure: '17',
      caption: 'narudžbi za sljedeću izvedbu',
      href: '/app/orders',
      action: 'Otvori Narudžbe',
    })
    expect(ordersCard({ count: 1, forNextShow: true }).caption).toBe(
      'narudžba za sljedeću izvedbu',
    )
    expect(ordersCard({ count: 3, forNextShow: false }).caption).toBe('narudžbe ukupno')
  })

  it('declines every counted noun rather than guessing one ending', () => {
    expect(inquiriesCard(1).caption).toBe('neodgovoren upit')
    expect(inquiriesCard(3).caption).toBe('neodgovorena upita')
    expect(inquiriesCard(11).caption).toBe('neodgovorenih upita')
    expect(performancesCard(0).caption).toBe('javnih izvedbi do kraja sezone')
    expect(usersCard(21).caption).toBe('račun')
  })

  it('puts the roster in the figure and the queue in a chip', () => {
    const quiet = membersCard({ active: 26, pending: 0 })
    expect(quiet.figure).toBe('26')
    expect(quiet.chip).toBeUndefined()
    expect(membersCard({ active: 26, pending: 2 }).chip).toEqual({
      label: '2 čeka odobrenje',
      tone: 'gold',
    })
  })

  it('gives the door its one number, and says so when there is no evening', () => {
    expect(scanCard({ admitted: 212, sold: 260 })).toMatchObject({
      figure: '212',
      caption: 'ušlo, od 260 prodanih',
    })
    expect(scanCard(null).figure).toBeNull()
  })

  it('keeps money to Financije, and takes it already formatted', () => {
    expect(financeCard('1.240,00 €')).toMatchObject({
      figure: '1.240,00 €',
      caption: 'prikupljeno ove sezone',
      href: '/app/finance',
    })
    // The two cards that would otherwise print euros print none.
    expect(statementCard().figure).toBeNull()
    expect(sellCard({ ticketsSold: 24, monthLabel: 'Rujan 2026' })).toMatchObject({
      figure: '24',
      caption: 'prodane karte, Rujan 2026',
    })
  })

  it('falls back to a sentence when a count could not be read', () => {
    expect(compCard(null).figure).toBeNull()
    expect(compCard(12).caption).toBe('gratis ulaznica ove sezone')
  })
})

describe('the Moreška card with no evening left', () => {
  it('tells a finished season from one that has not started', () => {
    expect(moreskaEmptyCard(true).caption).toBe(APP_STRINGS.moreska.eosTitle)
    expect(moreskaEmptyCard(false).caption).toBe(APP_STRINGS.moreska.eosNothingTitle)
    expect(moreskaEmptyCard(true)).toMatchObject({
      figure: null,
      href: '/app/moreska',
      action: 'Otvori Morešku',
    })
  })
})

describe('the ring and the podium', () => {
  it('turns the next evening into an arc over the venue’s capacity', () => {
    const card = statsCard({ sold: 212, capacity: 350, date: '2026-09-14', today: '2026-09-13' })
    expect(card.ring).toEqual({ value: 212, max: 350 })
    // The figure lives in the ring's hole; the caption is what it means.
    expect(card.caption).toBe('karata za sutra, od 350')
  })

  it('names the day once it is further out than tomorrow', () => {
    const card = statsCard({ sold: 40, capacity: 250, date: '2026-09-20', today: '2026-09-13' })
    expect(card.caption).toBe('karata za 20. rujna, od 250')
  })

  it('says there is no evening rather than drawing an empty ring', () => {
    const card = statsCard(null)
    expect(card.ring).toBeNull()
    expect(card.caption).toBe(APP_STRINGS.landing.noShow)
  })

  it('shows the top three and where the reader stands, in the dancer’s register', () => {
    const top = [
      { nickname: 'Brko', performances: 14 },
      { nickname: 'Cici', performances: 13 },
      { nickname: 'Baro', performances: 12 },
      { nickname: 'Tonko', performances: 11 },
    ]
    const card = leaderboardCard({
      top,
      me: { rank: 4, performances: 11 },
      countWords: APP_STRINGS.moreska.count,
    })
    expect(card.entries).toEqual([
      { label: 'Brko', value: 14 },
      { label: 'Cici', value: 13 },
      { label: 'Baro', value: 12 },
    ])
    expect(card.caption).toBe('ti si 4. s 11 nastupa')
  })

  it('names the leader for a reader who is not on the board', () => {
    const card = leaderboardCard({
      top: [{ nickname: 'Brko', performances: 14 }],
      me: null,
      countWords: APP_STRINGS.moreska.count,
    })
    expect(card.caption).toBe('vodi Brko s 14 nastupa')
  })

  it('says the season has not started rather than inventing a leader', () => {
    const card = leaderboardCard({ top: [], me: null, countWords: APP_STRINGS.home.count })
    expect(card.entries).toEqual([])
    expect(card.caption).toBe(APP_STRINGS.landing.noSeason)
  })
})

describe('the Obavijesti card', () => {
  it('carries the newest row and the unread count', () => {
    const card = inboxCard({
      latest: { title: 'Nova postava za 2. rujna', body: 'Plešeš kao crni kralj' },
      unread: 2,
    })
    expect(card).toMatchObject({
      title: 'Nova postava za 2. rujna',
      unread: 2,
      href: '/app/notifications',
    })
  })

  it('has no title when the inbox is empty, which is what the screen renders', () => {
    expect(inboxCard({ latest: null, unread: 0 }).title).toBeNull()
  })
})
