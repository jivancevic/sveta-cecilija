// What Stanje says, as pure functions over one loaded evening (#566, #620).
//
// Stanje is `/app/moreska/[id]`: who is coming tonight and who dances what. It
// is the dancer's register throughout ("nastup", CONTEXT.md), and it is the
// only screen where the two halves of an evening are in front of a voditelj at
// once — the answers on the left and the right, the titles on top of them.
//
// Six rules here are worth more than the shaping they look like:
//
//   1. **WHAT a column counts depends on whether the postava is confirmed**
//      (#620). Before it is, the number is `countArmies` over the attendance
//      answers — the single home of the counting rule — so a dancer moved
//      across armies moves column immediately and the head never disagrees with
//      the ArmyBar. Under those names stand the postava rows nobody answered
//      for, each with a "bez odgovora" chip, because a postava entered before
//      anybody was asked is a record Stanje must show and must not delete.
//      Once the postava is CONFIRMED the column counts the postava itself, and
//      so do the ArmyBar and the Bule card: the evening is settled, the answers
//      are a memory of how it was arranged, and the chip has nothing left to
//      say — which is exactly why it disappears with them.
//   2. **A place is a place, until the evening has been danced.** A column
//      short of its threshold shows the empty places as "mjesto 8", because the
//      two columns are a picture of the two lines on the pier and a line has
//      places. On a PAST nastup there are no places left to fill, so the slots
//      go and the column ends with one "+ Dodaj u crne" row instead (#620) —
//      the voditelj is no longer arranging an evening, they are writing down
//      the one that happened. On a confirmed postava neither is offered at all:
//      Otključaj first.
//   3. **Title dictates the top of a column** (#620). Crni kralj, otmanović,
//      then everybody else by nickname; bili kralj, then everybody else.
//      Answered and unanswered are ONE list, because "did they tap the button"
//      is not a fact about where somebody stands on the pier.
//   4. **A title is tonight's.** The crown comes from the evening's lineup and
//      never from the profile (glossary: *Title*), so a crni kralj by trade
//      wears a plain disc here until the voditelj gives him the title, and the
//      moment somebody else gets it his own disc goes plain again.
//   5. **Odustali is not a second copy of Ne dolaze.** A dancer who promised
//      and took it back is lifted OUT of "Ne dolaze" into its own list above
//      Bez odgovora (#612; glossary: *Odustajanje*), because the two are
//      operationally different: one is a place that was never filled, the other
//      a place that emptied after somebody counted on it. The two lists are
//      disjoint, so nobody is read twice.
//   6. **The voditelj exists only on a Moreška Experience** (#620; glossary:
//      *Voditelj (u postavi)*). He is in neither army and counts towards no
//      threshold, so he gets a card rather than a column — and on every other
//      kind of evening the card is not drawn, because the role is not a thing
//      those evenings have. The lineup route refuses the row for the same
//      reason.
//
// No IO and no Payload. There IS a clock, but not a reading of one: `nowMs` is
// cut by the loader with the rest of the payload (`detail-loaders.ts`), so the
// "has this nastup started" the screen draws and the `canAlarm` the server
// decided are answers to the same question asked at the same moment.

import {
  DANCE_TITLES,
  armyOfLineupRole,
  isDanceTitle,
  lineupRequirements,
  lineupWithTitles,
  titlesForArmy,
  titlesGiven,
  countTitles,
  type DanceTitle,
  type LineupRequirements,
  type TitleArmy,
} from '@/lib/lineup/titles'
import type { LineupEntry } from '@/lib/lineup/rules'
import { ARMY_OF_ROLE, DANCE_ROLES, type DanceRole } from '@/lib/moreskant-profile'
import type { LineupView, PerformanceDetail } from './detail-loaders'
import type { RosterPerson } from '@/lib/attendance/army-count'
import type { Army } from '@/lib/attendance/rules'
import { performancePlace } from './performance-place'
import { APP_STRINGS, PUSH_MESSAGES, formatPerformanceDateLong, timeOfDay } from './strings'
import { kindTone, kindWord, type KindTone } from './performance-kind'

const S = APP_STRINGS.stanje

/** How many titles an evening has: four, and the tally says so out loud. */
export const ALL_TITLES = DANCE_TITLES.length

/** One name in a column, in a card, in one of the sheets or in a picker. */
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
   * own count leaves them out, so the chip is what tells the voditelj why the
   * names are more than the number.
   *
   * Always FALSE once the postava is confirmed (#620): the column counts the
   * postava then, so a name in it is in the number, and there is nothing left
   * for the chip to explain.
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
  /**
   * Every dance role their PROFILE lists (#620), which is a fact about the
   * person and not about tonight.
   *
   * It is what the pickers and the Bez odgovora sheet filter by and draw as
   * small discs beside a name: "who else can dance the otmanović" is the
   * question a voditelj filling a column in actually has. Empty for a dancer
   * reading the screen, because the roster it comes from is loaded for a
   * voditelj only.
   */
  roles: DanceRole[]
  /** Their primary role: the disc a picker row wears. Null when unknown. */
  primaryRole: DanceRole | null
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
  /** "7 od 8", or just "7" once the nastup has been danced (#620). */
  head: string
  people: StanjePerson[]
  /**
   * "mjesto 8", one per place still to fill, and each of them the voditelj's
   * way of adding somebody (#620). Empty at or above the threshold, and empty
   * on a past or confirmed evening, where the row below takes over.
   */
  slots: string[]
  /**
   * "Dodaj u crne": the one row that ends a PAST column, in place of the eight
   * empty places nobody is going to fill any more (#620). Null before the
   * nastup (the slots are the gesture) and null once the postava is confirmed
   * (Otključaj is).
   */
  addRow: string | null
}

/** Which list a picker fills. */
export type PickerKey = TitleArmy | 'voditelj'

/**
 * One "add somebody" sheet (#620).
 *
 * The same shape for all four, because they differ only in who is eligible:
 * a column takes anybody whose profile covers that army, the Bule card takes
 * anybody whose PRIMARY role is bula, and the Experience's Voditelj card takes
 * any active moreškant at all — nothing on a profile says who may run a
 * morning, and the person who records it is the voditelj moreškanata.
 */
export interface StanjePicker {
  key: PickerKey
  /** "Dodaj u crne": the row that opens it and the sheet's own title. */
  title: string
  /**
   * Everyone who may be added, in reading order: those who have not said no
   * first, by nickname, then those who have — greyed rather than hidden,
   * because a voditelj adding somebody who said no is usually right and always
   * deliberate.
   */
  people: StanjePerson[]
  /**
   * The role every row in this list holds by definition, so it is not repeated
   * beside every name: nobody carries a "Crni" disc inside "Dodaj u crne".
   * Null where there is no such role (the voditelj's own list).
   */
  omitRole: DanceRole | null
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
  /**
   * The nastup has STARTED (#620).
   *
   * The same fact `canAlarm` is decided on, and deliberately not "the postava
   * is confirmed": a voditelj confirms hours or days later, and everything this
   * flag turns off — the shortfall line, the "od 8" in a column head, the eight
   * empty places — stops being useful the moment the evening is under way.
   */
  past: boolean
  /**
   * A Moreška Experience (#620): the one kind of evening that HAS a voditelj
   * and does not have the four titles. Everything the split decides reads this,
   * and `requirements` is the split itself.
   */
  experience: boolean
  /** What a confirmed postava of THIS kind must carry (`lineupRequirements`). */
  requirements: LineupRequirements
  /** The ArmyBar's three numbers. */
  armies: { crni: number; bili: number; threshold: { crni: number; bili: number } }
  /** Crni first, bili second: the order they stand in on the pier. */
  columns: StanjeColumn[]
  bule: StanjePerson[]
  /**
   * The Experience's voditelj, and an empty list on every other kind (#620).
   *
   * A list rather than one person, because the postava is a list of rows and
   * two of them is a state the database can hold: the confirm refuses it with a
   * sentence, and a screen that showed only the first would hide what the
   * refusal is talking about.
   */
  voditelji: StanjePerson[]
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
  /** The four "add somebody" sheets, by the list they fill (#620). */
  pickers: Record<PickerKey, StanjePicker>
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
   * Whether Potvrdi may be pressed at all, by THIS evening's rule (#620).
   *
   * The four titles on a moreška, one voditelj on an Experience. The server
   * decides the same thing again under the row lock and refuses with a Croatian
   * sentence, so this is a courtesy that keeps a disabled button honest rather
   * than the rule itself.
   */
  canConfirm: boolean
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

/**
 * Where a name sits inside its column (#620).
 *
 * The titled ones in the order `titlesForArmy` lists them — crni kralj then
 * otmanović, bili kralj alone — and everybody else after them. It is the order
 * the evening is read out in, and it does not care who tapped a button.
 */
function titleRank(army: TitleArmy, title: DanceTitle | null): number {
  const order = titlesForArmy(army)
  const at = title ? order.indexOf(title) : -1
  return at >= 0 ? at : order.length
}

function byTitleThenName(army: TitleArmy) {
  return (a: StanjePerson, b: StanjePerson) =>
    titleRank(army, a.title) - titleRank(army, b.title) ||
    a.nickname.localeCompare(b.nickname, 'hr')
}

/**
 * Which dance roles anybody in this list holds (#620).
 *
 * What the filter chips offer, and they offer nothing else: a chip for a role
 * nobody in front of you can dance is a control that can only ever empty the
 * list. `DANCE_ROLES` order, so the chips read the same way the profile form
 * does.
 */
export function rolesPresent(people: readonly StanjePerson[]): DanceRole[] {
  return DANCE_ROLES.filter((role) => people.some((person) => person.roles.includes(role)))
}

/** Everything Stanje draws, from one loaded evening. */
export function stanjeView(detail: PerformanceDetail): StanjeView {
  const p = detail.performance
  const count = detail.count
  const confirmed = detail.lineup.confirmed
  const past = !Number.isNaN(p.startMs) && p.startMs <= detail.nowMs
  const requirements = lineupRequirements(p.kind)
  const experience = requirements.voditelj

  // Every member with an attendance row of any kind. "No answer" is the ABSENCE
  // of a row (glossary: *Attendance*), so this list is what tells a postava row
  // somebody withdrew from apart from one nobody was ever asked about.
  const answeredPeople = [
    ...count.crni.members,
    ...count.bili.members,
    ...count.bula,
    ...count.notComing,
  ]
  const answered = answeredPeople.map((person) => person.memberId)
  const answeredSet = new Set(answered)

  const withdrewIds = new Set(count.withdrawn.map((person) => person.memberId))

  const lineup = effectiveLineup(detail.lineup, answered)
  const titles = titleMap(lineup)
  const inLineup = new Set(lineup.map((entry) => entry.memberId))

  /** What each member answered, so any list can open a sheet on the right state. */
  const answerOf = new Map<string, 'coming' | 'not_coming'>()
  for (const person of [...count.crni.members, ...count.bili.members, ...count.bula]) {
    answerOf.set(person.memberId, 'coming')
  }
  for (const person of count.notComing) answerOf.set(person.memberId, 'not_coming')

  // A nickname for anybody the screen can name: the roster, the lineup rows and
  // the answers all carry one, and a postava row for a member nobody can name
  // still has to be drawn rather than dropped.
  const names = new Map<string, string>()
  for (const person of count.noAnswer) names.set(person.memberId, person.nickname)
  for (const person of answeredPeople) names.set(person.memberId, person.nickname)
  for (const row of detail.lineup.roster) names.set(row.memberId, row.nickname)
  for (const row of detail.lineup.entries) names.set(row.memberId, row.nickname)

  /** The profile half of a name: their roles and their primary one (#620). */
  const profiles = new Map(
    detail.lineup.roster.map((row) => [
      row.memberId,
      { roles: row.roles, primaryRole: row.primaryRole },
    ]),
  )

  /**
   * One name, everywhere on this screen.
   *
   * `army` is the COLUMN it is being drawn in rather than anything on the
   * profile: a dancer moved to the bili for one evening is a bili here.
   */
  function personOf(
    memberId: string,
    army: TitleArmy | null,
    extra: {
      /** Draw the "bez odgovora" chip: a postava row with no answer under it. */
      chip?: boolean
      withdrew?: { at: string; own: boolean | null }
    } = {},
  ): StanjePerson {
    const answer = answerOf.get(memberId) ?? null
    const coming = answer === 'coming'
    const inList = inLineup.has(memberId)
    const other: Army | null = army === 'crni' ? 'bili' : army === 'bili' ? 'crni' : null
    const profile = profiles.get(memberId)
    return {
      memberId,
      nickname: names.get(memberId) ?? `#${memberId}`,
      army,
      // A title sits on a postava ROW, so somebody who said "ne dolazim" never
      // wears one (the overlay has already dropped it) and somebody who was
      // never asked keeps the one the dictated list gave them.
      title: inList ? (titles.get(memberId) ?? null) : null,
      titles: (coming || inList) && army ? titlesForArmy(army) : [],
      // A bula is in neither army and is never moved between them; everyone
      // else may be moved only if their profile covers the other side (story
      // 12). The move posts a "dolazim", so it is offered only to somebody who
      // is coming.
      moveTo:
        coming && other && (detail.moveTargets[memberId] ?? []).includes(other) ? other : null,
      answer,
      // Once the postava is confirmed the column counts the postava, so a name
      // standing in it IS in the number and the chip explains nothing (#620).
      noAnswer: extra.chip === true && !confirmed && !answeredSet.has(memberId),
      withdrewAt: extra.withdrew ? timeOfDay(extra.withdrew.at) : null,
      withdrewOwn: extra.withdrew ? extra.withdrew.own : null,
      roles: profile?.roles ?? [],
      primaryRole: profile?.primaryRole ?? null,
    }
  }

  /** Postava rows nobody answered for, by the column their stored role puts them in. */
  const dictated = (army: TitleArmy): StanjePerson[] =>
    lineup
      .filter((entry) => !answeredSet.has(entry.memberId) && armyOfLineupRole(entry.role) === army)
      .map((entry) => personOf(entry.memberId, army, { chip: true }))

  /**
   * Who stands in one column, and it is TWO different questions (#620).
   *
   * Confirmed: the postava, because that is what the evening was. Not yet: the
   * answers, plus the postava rows nobody answered for, because that is what
   * the voditelj is still arranging.
   */
  const peopleOf = (army: TitleArmy): StanjePerson[] => {
    const people = confirmed
      ? lineup
          .filter((entry) => armyOfLineupRole(entry.role) === army)
          .map((entry) => personOf(entry.memberId, army))
      : [
          ...(army === 'crni'
            ? count.crni.members
            : army === 'bili'
              ? count.bili.members
              : count.bula
          ).map((person: RosterPerson) => personOf(person.memberId, army)),
          ...dictated(army),
        ]
    return people.sort(byTitleThenName(army))
  }

  const bule = peopleOf('bula')

  function column(
    army: Army,
    tally: { count: number; threshold: number; below: boolean },
  ): StanjeColumn {
    const people = peopleOf(army)
    // Before the postava is confirmed the number is the ANSWERS and nothing
    // else, so the head and the ArmyBar can never disagree; a dictated row
    // stands under the names with its own chip instead of moving it. Once it is
    // confirmed the number IS the postava, which is what makes the chip
    // unnecessary and the head equal to the names above it (#620).
    const total = confirmed ? people.length : tally.count
    const threshold = tally.threshold
    const slots: string[] = []
    // Empty places are what a column is still SHORT of, which is a sentence
    // about an evening that has not happened yet. A past one has no places left
    // and a confirmed one may not change at all, so both end without them.
    if (!past && !confirmed) {
      for (let n = total + 1; n <= threshold; n += 1) slots.push(S.slot(n))
    }
    return {
      army,
      label: army === 'crni' ? APP_STRINGS.ui.armyCrni : APP_STRINGS.ui.armyBili,
      count: total,
      threshold,
      // Nothing is missing from an evening that has been danced.
      below: !past && (confirmed ? total < threshold : tally.below),
      head: past ? String(total) : S.ofThreshold(total, threshold),
      people,
      slots,
      addRow: past && !confirmed ? S.addTo[army] : null,
    }
  }

  const columns = [column('crni', count.crni), column('bili', count.bili)]

  const voditelji = experience
    ? lineup
        .filter((entry) => entry.role === 'voditelj')
        .map((entry) => personOf(entry.memberId, null))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'hr'))
    : []

  /**
   * One picker, over the whole roster minus whoever is already in that list.
   *
   * `eligible` is the profile rule and the ONLY thing that differs between the
   * four: a column wants somebody whose profile covers that army (so the
   * otmanović is never offered to a dancer who cannot dance him), the Bule card
   * wants somebody whose primary role IS bula, and the voditelj's list wants
   * anybody at all.
   */
  function picker(
    key: PickerKey,
    title: string,
    already: readonly StanjePerson[],
    omitRole: DanceRole | null,
    eligible: (profile: { roles: DanceRole[]; primaryRole: DanceRole | null }) => boolean,
  ): StanjePicker {
    const taken = new Set(already.map((person) => person.memberId))
    const people = detail.lineup.roster
      .filter((row) => !taken.has(row.memberId))
      .filter((row) => eligible({ roles: row.roles, primaryRole: row.primaryRole }))
      .map((row) => personOf(row.memberId, null))
      .sort(
        (a, b) =>
          // Whoever said "ne dolazim" sinks to the bottom rather than out of the
          // list: adding them is usually a correction and always deliberate.
          Number(a.answer === 'not_coming') - Number(b.answer === 'not_coming') ||
          a.nickname.localeCompare(b.nickname, 'hr'),
      )
    return { key, title, people, omitRole }
  }

  const inArmy = (army: Army) => (profile: { roles: DanceRole[] }) =>
    profile.roles.some((role) => ARMY_OF_ROLE[role] === army)

  const pickers: Record<PickerKey, StanjePicker> = {
    crni: picker('crni', S.addTo.crni, columns[0].people, 'crni', inArmy('crni')),
    bili: picker('bili', S.addTo.bili, columns[1].people, 'bili', inArmy('bili')),
    // A bula is not a third value of the attendance army (glossary: *Army
    // count*), so she is picked by her PROFILE: every bula on the roster dances
    // the bula and nothing else, which is what makes the primary role the whole
    // of the rule here.
    bula: picker('bula', S.addTo.bula, bule, 'bula', (profile) => profile.primaryRole === 'bula'),
    // Nothing on a profile says who may run an Experience, so nothing filters
    // this list. Who may WRITE it is the permission, and that is the route's.
    voditelj: picker('voditelj', S.addVoditelj, voditelji, null, () => true),
  }

  const given = titlesGiven(countTitles(lineup.map((entry) => entry.role)))

  return {
    id: p.id,
    head: [formatPerformanceDateLong(p.date), kindWord(p.kind)].filter(Boolean).join(' · '),
    headDate: formatPerformanceDateLong(p.date),
    kind: kindWord(p.kind),
    tone: kindTone(p.kind),
    meta: [p.time, performancePlace(p)].filter(Boolean).join(' · '),
    note: p.voditeljNote,
    cancelled: p.cancelled,
    confirmed,
    past,
    experience,
    requirements,
    armies: {
      // The bar counts what the columns count, always: one rule, three places
      // that draw it, and no arithmetic of its own (#620).
      crni: columns[0].count,
      bili: columns[1].count,
      threshold: { crni: count.crni.threshold, bili: count.bili.threshold },
    },
    columns,
    bule,
    voditelji,
    // The two halves of "not coming", and they are disjoint: a name that
    // appears in `withdrawn` is taken out of `notComing` rather than repeated,
    // so the voditelj reads each person once and the counts still add up.
    withdrawn: count.withdrawn.map((person) =>
      personOf(person.memberId, null, {
        withdrew: { at: person.withdrewAt, own: person.withdrewOwn },
      }),
    ),
    notComing: count.notComing
      .filter((person) => !withdrewIds.has(person.memberId))
      .map((person) => personOf(person.memberId, null)),
    // Still every member with no answer, postava row or not: the list answers
    // "who has not said anything", which a dictated row does not change.
    noAnswer: count.noAnswer.map((person) => personOf(person.memberId, null)),
    pickers,
    callMessage: {
      title: PUSH_MESSAGES.alarm.title,
      body: PUSH_MESSAGES.alarm.body({
        date: p.date,
        time: p.time,
        bili: count.bili.count,
        crni: count.crni.count,
      }),
    },
    titlesGiven: given,
    canConfirm: requirements.voditelj ? voditelji.length === 1 : given === ALL_TITLES,
    lineup,
  }
}
