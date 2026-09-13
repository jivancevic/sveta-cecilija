// What Stanje says, as pure functions over one loaded evening (#566).
//
// Stanje is `/app/moreska/[id]`: who is coming tonight and who dances what. It
// is the dancer's register throughout ("nastup", CONTEXT.md), and it is the
// only screen where the two halves of an evening are in front of a voditelj at
// once — the answers on the left and the right, the titles on top of them.
//
// Three rules here are worth more than the shaping they look like:
//
//   1. **A column is the army, not the postava.** Who stands in crni is decided
//      by `countArmies` over the attendance answers, which is the single home
//      of the counting rule; the lineup only decides whether a crown sits on a
//      name. That is why a dancer who is moved across armies moves column
//      immediately, before anybody saves a postava.
//   2. **A place is a place.** A column short of its threshold shows the empty
//      places as "mjesto 8", because the two columns are a picture of the two
//      lines on the pier and a line has places in it. Never a dash and never a
//      warning: the ArmyBar above already says how many are missing.
//   3. **A title is tonight's.** The crown comes from the evening's lineup and
//      never from the profile (glossary: *Title*), so a crni kralj by trade
//      wears a plain disc here until the voditelj gives him the title, and the
//      moment somebody else gets it his own disc goes plain again.
//
// No IO, no clock, no Payload: the page hands over what the seam loaded and
// gets back what to draw.

import {
  DANCE_TITLES,
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
import { APP_STRINGS, PUSH_MESSAGES, formatPerformanceDateLong } from './strings'
import { nastupTitle } from './moreska-screen'

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
   * A non-regular evening reads "Vanredna" and never names its client (Q30,
   * the same rule Moreška's rows follow): which agency booked it changes
   * nothing about turning up.
   */
  head: string
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
 * titles overlaid ({@link lineupWithTitles}); once it is confirmed, or for a
 * dancer, it is exactly what is stored, which the loader has already emptied
 * for a dancer looking at a draft (story 34).
 */
export function effectiveLineup(lineup: LineupView): LineupEntry[] {
  const stored: LineupEntry[] = lineup.entries.map((row) => ({
    memberId: row.memberId,
    role: row.role,
  }))
  if (!lineup.canEdit) return stored
  const coming: LineupEntry[] = lineup.suggested.map((row) => ({
    memberId: row.memberId,
    role: row.role,
  }))
  return lineupWithTitles({ coming, stored })
}

function titleMap(entries: readonly LineupEntry[]): Map<string, DanceTitle> {
  const out = new Map<string, DanceTitle>()
  for (const entry of entries) {
    if (isDanceTitle(entry.role)) out.set(entry.memberId, entry.role)
  }
  return out
}

function toPerson(
  person: RosterPerson,
  input: {
    army: TitleArmy | null
    answer: 'coming' | 'not_coming' | null
    titles: Map<string, DanceTitle>
    moveTargets: Record<string, Army[]>
  },
): StanjePerson {
  const army = input.army
  // Only a dancer who is COMING has a place in the postava, so only they can
  // wear a title: a crown on somebody who said "ne dolazim" would be a promise
  // the evening cannot keep.
  const coming = input.answer === 'coming'
  const other: Army | null = army === 'crni' ? 'bili' : army === 'bili' ? 'crni' : null
  return {
    memberId: person.memberId,
    nickname: person.nickname,
    army,
    title: coming ? (input.titles.get(person.memberId) ?? null) : null,
    titles: coming && army ? titlesForArmy(army) : [],
    // A bula is in neither army and is never moved between them; everyone else
    // may be moved only if their profile covers the other side (story 12).
    moveTo:
      coming && other && (input.moveTargets[person.memberId] ?? []).includes(other) ? other : null,
    answer: input.answer,
  }
}

function column(
  army: Army,
  tally: { count: number; threshold: number; below: boolean; members: RosterPerson[] },
  shared: { titles: Map<string, DanceTitle>; moveTargets: Record<string, Army[]> },
): StanjeColumn {
  const slots: string[] = []
  for (let n = tally.count + 1; n <= tally.threshold; n += 1) slots.push(S.slot(n))
  return {
    army,
    label: army === 'crni' ? APP_STRINGS.ui.armyCrni : APP_STRINGS.ui.armyBili,
    count: tally.count,
    threshold: tally.threshold,
    below: tally.below,
    head: S.ofThreshold(tally.count, tally.threshold),
    people: tally.members.map((person) =>
      toPerson(person, { army, answer: 'coming', ...shared }),
    ),
    slots,
  }
}

/** Everything Stanje draws, from one loaded evening. */
export function stanjeView(detail: PerformanceDetail): StanjeView {
  const p = detail.performance
  const lineup = effectiveLineup(detail.lineup)
  const titles = titleMap(lineup)
  const shared = { titles, moveTargets: detail.moveTargets }

  return {
    id: p.id,
    head: [formatPerformanceDateLong(p.date), nastupTitle(p)].filter(Boolean).join(' · '),
    meta: [p.time, performancePlace(p)].filter(Boolean).join(' · '),
    note: p.voditeljNote,
    cancelled: p.cancelled,
    confirmed: detail.lineup.confirmed,
    armies: {
      crni: detail.count.crni.count,
      bili: detail.count.bili.count,
      threshold: { crni: detail.count.crni.threshold, bili: detail.count.bili.threshold },
    },
    columns: [
      column('crni', detail.count.crni, shared),
      column('bili', detail.count.bili, shared),
    ],
    bule: detail.count.bula.map((person) =>
      toPerson(person, { army: 'bula', answer: 'coming', ...shared }),
    ),
    notComing: detail.count.notComing.map((person) =>
      toPerson(person, { army: null, answer: 'not_coming', ...shared }),
    ),
    noAnswer: detail.count.noAnswer.map((person) =>
      toPerson(person, { army: null, answer: null, ...shared }),
    ),
    callMessage: {
      title: PUSH_MESSAGES.alarm.title,
      body: PUSH_MESSAGES.alarm.body({
        date: p.date,
        time: p.time,
        bili: detail.count.bili.count,
        crni: detail.count.crni.count,
      }),
    },
    titlesGiven: titlesGiven(countTitles(lineup.map((entry) => entry.role))),
    lineup,
  }
}
