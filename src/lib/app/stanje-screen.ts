// What Stanje says, as pure functions over one loaded evening (#566).
//
// Stanje is `/app/moreska/[id]`: who is coming tonight and who dances what. It
// is the dancer's register throughout ("nastup", CONTEXT.md), and it is the
// only screen where the two halves of an evening are in front of a voditelj at
// once — the answers on the left and the right, the titles on top of them.
//
// Four rules here are worth more than the shaping they look like:
//
//   1. **A column's NUMBER is the army; its names may also come from the
//      postava.** The count is `countArmies` over the attendance answers, the
//      single home of the counting rule, so a dancer moved across armies moves
//      column immediately and the head never disagrees with the ArmyBar. Under
//      those names stand the postava rows nobody answered for (#581 review) —
//      a list dictated through the MCP tool or the Backoffice editor — each
//      with a "bez odgovora" chip, because a postava entered before anybody was
//      asked is a record Stanje must show and must not delete.
//   2. **A place is a place.** A column short of its threshold shows the empty
//      places as "mjesto 8", because the two columns are a picture of the two
//      lines on the pier and a line has places in it. Never a dash and never a
//      warning: the ArmyBar above already says how many are missing.
//   3. **A title is tonight's.** The crown comes from the evening's lineup and
//      never from the profile (glossary: *Title*), so a crni kralj by trade
//      wears a plain disc here until the voditelj gives him the title, and the
//      moment somebody else gets it his own disc goes plain again.
//   4. **Odustali is not a second copy of Ne dolaze.** A dancer who promised
//      and took it back is lifted OUT of "Ne dolaze" into its own list above
//      Bez odgovora (#612; glossary: *Odustajanje*), because the two are
//      operationally different: one is a place that was never filled, the other
//      a place that emptied after somebody counted on it. The two lists are
//      disjoint, so nobody is read twice.
//
// No IO, no clock, no Payload: the page hands over what the seam loaded and
// gets back what to draw.

import {
  DANCE_TITLES,
  armyOfLineupRole,
  isDanceTitle,
  lineupWithTitles,
  titlesForArmy,
  titlesGiven,
  countTitles,
  type DanceTitle,
  type TitleArmy,
} from '@/lib/lineup/titles'
import type { LineupEntry } from '@/lib/lineup/rules'
import type { LineupView, PerformanceDetail } from './detail-loaders'
import type { RosterPerson } from '@/lib/attendance/army-count'
import type { Army } from '@/lib/attendance/rules'
import { performancePlace } from './performance-place'
import { APP_STRINGS, PUSH_MESSAGES, formatPerformanceDateLong, timeOfDay } from './strings'
import { kindTone, kindWord, type KindTone } from './performance-kind'

const S = APP_STRINGS.stanje

/** How many titles an evening has: four, and the tally says so out loud. */
export const ALL_TITLES = DANCE_TITLES.length

/** One name in a column, in the Bule card or in one of the two sheets. */
export interface StanjePerson {
  memberId: string
  nickname: string
  /** The disc: the column they are standing in. Null for a name with no answer. */
  army: TitleArmy | null
  /** The crown: this evening's title, never the profile's role. */
  title: DanceTitle | null
  /** The titles the voditelj may give them tonight; empty unless they are coming. */
  titles: DanceTitle[]
  /** The other army, when this dancer holds both. Never for a bula. */
  moveTo: Army | null
  /** What they answered, so a sheet opens on the state it is changing. */
  answer: 'coming' | 'not_coming' | null
  /**
   * They stand in this column because the POSTAVA says so and not because they
   * answered (#581 review): a dictated list, from the MCP tool or the
   * Backoffice editor, for an evening nobody has answered for yet. The column's
   * own count never includes them, so the chip is what tells the voditelj why
   * the names are more than the number.
   */
  noAnswer: boolean
  /**
   * When they took a standing dolazim back, as a time of day ("19:40"), and
   * null for everybody else (#612). The date is the evening's own, so the hour
   * is the whole of what a voditelj reads.
   */
  withdrewAt: string | null
  /**
   * False when a voditelj wrote the odustajanje down instead of the dancer:
   * the person phoned, which is a different evening from one who went quiet.
   * Null wherever `withdrewAt` is.
   */
  withdrewOwn: boolean | null
}

/** One army's column. */
export interface StanjeColumn {
  army: Army
  /** "Crni" / "Bili". */
  label: string
  count: number
  threshold: number
  /** True below the threshold: what turns the head's number warn. */
  below: boolean
  /** "7 od 8". */
  head: string
  people: StanjePerson[]
  /** "mjesto 8", one per place still to fill. Empty at or above the threshold. */
  slots: string[]
}

export interface StanjeView {
  id: string
  /**
   * "Subota, 19. rujna · Redovna" — the evening, in the DANCER's register.
   *
   * The kind is the one word `performance-kind.ts` gives it and never the
   * client (Q30, the same rule Moreška's rows follow): which agency booked an
   * evening changes nothing about turning up for it. Since #591 that is three
   * words rather than two, because an Experience is its own thing.
   */
  head: string
  /** The same date WITHOUT the kind: "Subota, 19. rujna" (#592). */
  headDate: string
  /** "Redovna", "Vanredna" or "Experience", for the chip beside it. */
  kind: string
  /** Which of the three categories it is, so the chip can wear its tone. */
  tone: KindTone
  /** "21:00 · Ljetno kino". */
  meta: string
  note: string | null
  cancelled: boolean
  confirmed: boolean
  /** The ArmyBar's three numbers. */
  armies: { crni: number; bili: number; threshold: { crni: number; bili: number } }
  /** Crni first, bili second: the order they stand in on the pier. */
  columns: StanjeColumn[]
  bule: StanjePerson[]
  /**
   * Said dolazim, let it stand, then took it back (#612; glossary:
   * *Odustajanje*). Newest first, and ABOVE Bez odgovora on the screen, because
   * these are the places a voditelj thought were filled.
   *
   * Disjoint from `notComing` by construction: a name appears in exactly one of
   * the two lists, so the two counts add up to everyone who is not coming.
   */
  withdrawn: StanjePerson[]
  /** Answered ne dolazim without ever having promised otherwise. */
  notComing: StanjePerson[]
  noAnswer: StanjePerson[]
  /**
   * The alarm exactly as it would be sent, for the Pozovi sheet to show before
   * anybody sends it (#566, Q35).
   *
   * It is `PUSH_MESSAGES.alarm` itself and not a second wording: the sentence a
   * voditelj reads in the sheet and the one that lands on twenty phones are the
   * same string, so the preview cannot lie. The numbers in it are the current
   * headcount, which is what the sender puts there too.
   */
  callMessage: { title: string; body: string }
  /** How many of the four titles have exactly one holder right now. */
  titlesGiven: number
  /**
   * The whole postava as it stands: the answers with tonight's titles on them.
   *
   * This is the list a title write REPLACES, so the saved postava is always the
   * evening on screen rather than the evening as it was when the first title
   * was handed out. A dancer gets the stored list instead, which is empty until
   * the voditelj confirms.
   */
  lineup: LineupEntry[]
}

/**
 * The postava this screen is looking at.
 *
 * While the voditelj may still edit it, that is the answers with the stored
 * rows overlaid ({@link lineupWithTitles}); once it is confirmed, or for a
 * dancer, it is exactly what is stored, which the loader has already emptied
 * for a dancer looking at a draft (story 34).
 *
 * `answered` is every member with an attendance row of any kind, which is the
 * difference between "said no" and "was never asked": the first drops a stored
 * row, the second keeps it whole.
 */
export function effectiveLineup(
  lineup: LineupView,
  answered: readonly string[],
): LineupEntry[] {
  const stored: LineupEntry[] = lineup.entries.map((row) => ({
    memberId: row.memberId,
    role: row.role,
  }))
  if (!lineup.canEdit) return stored
  const coming: LineupEntry[] = lineup.suggested.map((row) => ({
    memberId: row.memberId,
    role: row.role,
  }))
  return lineupWithTitles({ coming, stored, answered })
}

function titleMap(entries: readonly LineupEntry[]): Map<string, DanceTitle> {
  const out = new Map<string, DanceTitle>()
  for (const entry of entries) {
    if (isDanceTitle(entry.role)) out.set(entry.memberId, entry.role)
  }
  return out
}

function toPerson(
  person: { memberId: string; nickname: string },
  input: {
    army: TitleArmy | null
    answer: 'coming' | 'not_coming' | null
    /** They have a row in the postava, so a title can sit on them. */
    inLineup: boolean
    /** Draw the "bez odgovora" chip: a postava row with no answer under it. */
    noAnswer?: boolean
    titles: Map<string, DanceTitle>
    moveTargets: Record<string, Army[]>
    /** The odustajanje, for the one list that has it (#612). */
    withdrew?: { at: string; own: boolean | null }
  },
): StanjePerson {
  const army = input.army
  const coming = input.answer === 'coming'
  const other: Army | null = army === 'crni' ? 'bili' : army === 'bili' ? 'crni' : null
  return {
    memberId: person.memberId,
    nickname: person.nickname,
    army,
    // A title sits on a postava ROW, so somebody who said "ne dolazim" never
    // wears one (the overlay has already dropped it) and somebody who was never
    // asked keeps the one the dictated list gave them.
    title: input.inLineup ? (input.titles.get(person.memberId) ?? null) : null,
    titles: (coming || input.inLineup) && army ? titlesForArmy(army) : [],
    // A bula is in neither army and is never moved between them; everyone else
    // may be moved only if their profile covers the other side (story 12). The
    // move posts a "dolazim", so it is offered only to somebody who is coming.
    moveTo:
      coming && other && (input.moveTargets[person.memberId] ?? []).includes(other) ? other : null,
    answer: input.answer,
    noAnswer: input.noAnswer === true,
    withdrewAt: input.withdrew ? timeOfDay(input.withdrew.at) : null,
    withdrewOwn: input.withdrew ? input.withdrew.own : null,
  }
}

function column(
  army: Army,
  tally: { count: number; threshold: number; below: boolean; members: RosterPerson[] },
  /** Postava rows in this column whose member never answered (#581 review). */
  unanswered: StanjePerson[],
  shared: { titles: Map<string, DanceTitle>; moveTargets: Record<string, Army[]> },
  /** Who has a row in the postava, so a title can sit on them. */
  inLineup: Set<string>,
): StanjeColumn {
  const slots: string[] = []
  // The head counts ANSWERS and nothing else: the ArmyBar above it is about who
  // said they are coming, and the two must never disagree. A dictated row shows
  // under the names with its own chip instead of moving the number.
  for (let n = tally.count + 1; n <= tally.threshold; n += 1) slots.push(S.slot(n))
  return {
    army,
    label: army === 'crni' ? APP_STRINGS.ui.armyCrni : APP_STRINGS.ui.armyBili,
    count: tally.count,
    threshold: tally.threshold,
    below: tally.below,
    head: S.ofThreshold(tally.count, tally.threshold),
    people: [
      ...tally.members.map((person) =>
        toPerson(person, {
          army,
          answer: 'coming',
          inLineup: inLineup.has(person.memberId),
          ...shared,
        }),
      ),
      ...unanswered,
    ],
    slots,
  }
}

/** Everything Stanje draws, from one loaded evening. */
export function stanjeView(detail: PerformanceDetail): StanjeView {
  const p = detail.performance
  const count = detail.count

  // Every member with an attendance row of any kind. "No answer" is the ABSENCE
  // of a row (glossary: *Attendance*), so this list is what tells a postava row
  // somebody withdrew from apart from one nobody was ever asked about.
  const answered = [
    ...count.crni.members,
    ...count.bili.members,
    ...count.bula,
    ...count.notComing,
  ].map((person) => person.memberId)
  const answeredSet = new Set(answered)

  const withdrewIds = new Set(count.withdrawn.map((person) => person.memberId))

  const lineup = effectiveLineup(detail.lineup, answered)
  const titles = titleMap(lineup)
  const inLineup = new Set(lineup.map((entry) => entry.memberId))
  const shared = { titles, moveTargets: detail.moveTargets }

  // A nickname for a postava row whose member answered nothing: the lineup rows
  // carry one, and the no-answer roster carries one for everybody still active.
  const names = new Map<string, string>()
  for (const person of count.noAnswer) names.set(person.memberId, person.nickname)
  for (const row of detail.lineup.entries) names.set(row.memberId, row.nickname)

  /** Postava rows nobody answered for, by the column their stored role puts them in. */
  const dictated = (army: TitleArmy) =>
    lineup
      .filter(
        (entry) => !answeredSet.has(entry.memberId) && armyOfLineupRole(entry.role) === army,
      )
      .map((entry) =>
        toPerson(
          { memberId: entry.memberId, nickname: names.get(entry.memberId) ?? `#${entry.memberId}` },
          { army, answer: null, inLineup: true, noAnswer: true, ...shared },
        ),
      )
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'hr'))

  return {
    id: p.id,
    head: [formatPerformanceDateLong(p.date), kindWord(p.kind)].filter(Boolean).join(' · '),
    headDate: formatPerformanceDateLong(p.date),
    kind: kindWord(p.kind),
    tone: kindTone(p.kind),
    meta: [p.time, performancePlace(p)].filter(Boolean).join(' · '),
    note: p.voditeljNote,
    cancelled: p.cancelled,
    confirmed: detail.lineup.confirmed,
    armies: {
      crni: count.crni.count,
      bili: count.bili.count,
      threshold: { crni: count.crni.threshold, bili: count.bili.threshold },
    },
    columns: [
      column('crni', count.crni, dictated('crni'), shared, inLineup),
      column('bili', count.bili, dictated('bili'), shared, inLineup),
    ],
    bule: [
      ...count.bula.map((person) =>
        toPerson(person, { army: 'bula', answer: 'coming', inLineup: inLineup.has(person.memberId), ...shared }),
      ),
      ...dictated('bula'),
    ],
    // The two halves of "not coming", and they are disjoint: a name that
    // appears in `withdrawn` is taken out of `notComing` rather than repeated,
    // so the voditelj reads each person once and the counts still add up.
    withdrawn: count.withdrawn.map((person) =>
      toPerson(person, {
        army: null,
        answer: 'not_coming',
        inLineup: false,
        withdrew: { at: person.withdrewAt, own: person.withdrewOwn },
        ...shared,
      }),
    ),
    notComing: count.notComing
      .filter((person) => !withdrewIds.has(person.memberId))
      .map((person) =>
        toPerson(person, { army: null, answer: 'not_coming', inLineup: false, ...shared }),
      ),
    // Still every member with no answer, postava row or not: the list answers
    // "who has not said anything", which a dictated row does not change.
    noAnswer: count.noAnswer.map((person) =>
      toPerson(person, {
        army: null,
        answer: null,
        inLineup: inLineup.has(person.memberId),
        ...shared,
      }),
    ),
    callMessage: {
      title: PUSH_MESSAGES.alarm.title,
      body: PUSH_MESSAGES.alarm.body({
        date: p.date,
        time: p.time,
        bili: count.bili.count,
        crni: count.crni.count,
      }),
    },
    titlesGiven: titlesGiven(countTitles(lineup.map((entry) => entry.role))),
    lineup,
  }
}
