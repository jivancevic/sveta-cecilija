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
import { zagrebDayOf } from '@/lib/zagreb-time'
import { APP_STRINGS, PUSH_MESSAGES, formatPerformanceDateLong, timeOfDay } from './strings'
import { kindTone, kindWord, type KindTone } from './performance-kind'

const S = APP_STRINGS.stanje
const K = APP_STRINGS.listKeepers

/** How many titles an evening has: four, and the tally says so out loud. */
export const ALL_TITLES = DANCE_TITLES.length

/** One name in a column, in a card, in one of the sheets or in a picker. */
export interface StanjePerson {
  memberId: string
  nickname: string
  /**
   * Their real name, for the search box only (#633).
   *
   * Every list on this screen is searched by what a voditelj types, and half
   * the roster is known to him by a surname; nothing draws this, the rows stay
   * nicknames. Null for everybody when a DANCER is reading, because it rides
   * the voditelj-only roster.
   */
  name: string | null
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
  /**
   * In a PICKER, and nowhere else: this dancer's profile does not cover the
   * army of the column being filled (#633).
   *
   * Anybody may dance any role if the evening truly needs it, so "Dodaj u bile"
   * offers the crni as well; they sort to the bottom under a caption rather
   * than mixing into the names, because the list is read from the top and the
   * first half is who a voditelj is actually looking for. Always false outside
   * a picker, where the flag has nothing to be about.
   */
  outsider: boolean
  /**
   * Their mobile, for the Nazovi row on the person sheet (#624).
   *
   * Filled for a VODITELJ only, and null for everybody else: he is the one who
   * chases a missing dancer, and a number nobody on this screen is going to
   * ring has no business being serialised into a dancer's browser. That the
   * roster already carries it (ADR-0024 draws the PII line at mobiles yes,
   * e-mails never) is what makes the row possible, not a reason to ship it to
   * every reader.
   */
  mobile: string | null
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
   * The "+ Dodaj bulu" row, or null when there is nothing left to add (#627).
   *
   * **An evening has exactly one bula.** She is one person in one dance, so a
   * second is a mis-tap rather than a choice, and the row that would make one
   * is gone the moment the first is in. `POST /api/app/lineup` refuses the
   * second write as well: this null is the courtesy, the route is the rule.
   */
  buleAddRow: string | null
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
   * The READER's own answer, when they are a dancer and the evening is still
   * ahead (#624). Null for anybody else, and the whole of the rule.
   *
   * A voditelj who does not dance has no Member to answer for; a blagajna never
   * reaches this screen at all (`moreska` is unlocked by `moreskant` and
   * `moreska` only). Josip asked for the pair here because Stanje is where a
   * dancer ends up when they tap the bar on Moreška, and having to go back a
   * screen to say "dolazim" is the one thing the deep link was for.
   */
  me: { memberId: string; answer: 'coming' | 'not_coming' | null } | null
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
  /**
   * Whether the reader keeps THIS evening's list (ADR-0029, #658): a voditelj
   * on every evening, a Zaduženi on this one. Every control that RUNS the night
   * hangs off this. The alarm does not — that is the `voditelj` prop, and the
   * two being different fields is the whole point of the ticket.
   */
  keepsList: boolean
  /** "Popis vodi: …", or null when no third party is named. */
  keptBy: string | null
  /** The Members named, for the sheet's switches. */
  listKeepers: string[]
  /** The Zaduženi sheet's list: every active moreškant. */
  keeperPicker: StanjePicker
  /** "Potvrdio: … · …", or null on an unconfirmed or unsigned postava. */
  confirmedBy: string | null
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
/**
 * The DAY a postava was confirmed, in Korčula's own clock (#658).
 *
 * `confirmedAt` is a UTC instant, and slicing ten characters off it names the
 * previous day for anything confirmed between midnight and 02:00 CEST — which
 * is exactly when a postava gets confirmed, because it is written down after
 * the evening. So it goes through the same real zone conversion every other
 * date on this screen does.
 */
function confirmedDay(confirmedAt: string | null): string {
  if (!confirmedAt) return ''
  const instant = new Date(confirmedAt)
  if (Number.isNaN(instant.getTime())) return ''
  return formatPerformanceDateLong(zagrebDayOf(instant))
}

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

  /**
   * Who runs this evening rather than dancing it (#620 review).
   *
   * They are taken OUT of the two columns and the Bule card, and out of the
   * numbers over them, whatever they answered: a voditelj who taps Dolazim on
   * Moreška has said he will be there, not that he is dancing. Without this he
   * stood in the crni column and on his own card at once, was counted in both,
   * and then vanished from the column the moment Potvrdi turned the count into
   * the postava — the numbers jumped on a button that was supposed to settle
   * them.
   */
  const leading = new Set(
    lineup.filter((entry) => entry.role === 'voditelj').map((entry) => entry.memberId),
  )

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

  /**
   * A mobile for anybody the screen can name, and ONLY for whoever keeps this
   * evening's list (#624, widened from `voditelj` to `keepsList` by #658).
   * Everybody else gets an empty map, so the field is null all the way to the
   * browser rather than hidden once it has arrived there. The Zaduženi is the
   * person ringing round at seven in the evening, so they are exactly who the
   * numbers are for.
   */
  const mobiles = new Map<string, string>()
  if (detail.keepsList) {
    for (const person of [...answeredPeople, ...count.noAnswer]) {
      if (person.mobile) mobiles.set(person.memberId, person.mobile)
    }
  }

  /** The profile half of a name: their roles and their primary one (#620). */
  const profiles = new Map(
    detail.lineup.roster.map((row) => [
      row.memberId,
      { name: row.name, roles: row.roles, primaryRole: row.primaryRole },
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
      name: profile?.name ?? null,
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
      // Only a picker knows which column it is filling, so only a picker sets
      // this; every other list draws the same person with it off.
      outsider: false,
      mobile: mobiles.get(memberId) ?? null,
    }
  }

  /** Postava rows nobody answered for, by the column their stored role puts them in. */
  const dictated = (army: TitleArmy): StanjePerson[] =>
    lineup
      .filter((entry) => !answeredSet.has(entry.memberId) && armyOfLineupRole(entry.role) === army)
      .map((entry) => personOf(entry.memberId, army, { chip: true }))

  /** The answered members of one column, minus whoever is running the evening. */
  const answeredIn = (army: TitleArmy): RosterPerson[] =>
    (army === 'crni'
      ? count.crni.members
      : army === 'bili'
        ? count.bili.members
        : count.bula
    ).filter((person) => !leading.has(person.memberId))

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
          ...answeredIn(army).map((person) => personOf(person.memberId, army)),
          ...dictated(army),
        ]
    return people.sort(byTitleThenName(army))
  }

  // Before the postava is confirmed the number is the ANSWERS and nothing else,
  // so the head and the ArmyBar can never disagree; a dictated row stands under
  // the names with its own chip instead of moving it. Once it is confirmed the
  // number IS the postava, which is what makes the chip unnecessary and the
  // head equal to the names above it (#620).
  const totalOf = (army: Army, people: StanjePerson[]) =>
    confirmed ? people.length : answeredIn(army).length

  const peopleByArmy = { crni: peopleOf('crni'), bili: peopleOf('bili') } as const
  const totalByArmy = {
    crni: totalOf('crni', peopleByArmy.crni),
    bili: totalOf('bili', peopleByArmy.bili),
  }

  /**
   * How many rows a column draws, and it is the SAME number for both (#627).
   *
   * Both sides of the pier stand at one height: a column at 8 of 8 that ended
   * at its last name had nowhere to add a ninth while the other at 3 of 8
   * showed five holes.
   *
   * **The threshold is the height until an army reaches it** (#633). A
   * threshold of 10 draws ten places, not eleven: the eleventh is a place the
   * evening does not want yet, and a voditelj counting holes was counting one
   * too many all season. Once some army actually fills the tenth, one more
   * opens, and after that the height follows the longest column, so there is
   * always exactly one empty place to drop somebody into and never one before
   * the evening is full. Both thresholds are in `base` because the two armies
   * may carry different ones.
   *
   * **The lengths, not the counts.** They are different numbers on an
   * unconfirmed evening: the count is the ANSWERS (#620), and a column also
   * draws the postava rows nobody answered for. Measuring the height by the
   * count would let a dictated row push one column past the other, which is the
   * very thing this is here to stop.
   */
  const base = Math.max(count.crni.threshold, count.bili.threshold)
  const longest = Math.max(peopleByArmy.crni.length, peopleByArmy.bili.length)
  const rows = longest >= base ? longest + 1 : base

  function column(army: 'crni' | 'bili', tally: { threshold: number }): StanjeColumn {
    const people = peopleByArmy[army]
    const total = totalByArmy[army]
    const threshold = tally.threshold
    const slots: string[] = []
    // Empty places are what a column is still SHORT of, which is a sentence
    // about an evening that has not happened yet. A past one has no places left
    // and a confirmed one may not change at all, so both end without them.
    if (!past && !confirmed) {
      // From the length of the column, for the same reason `rows` is measured
      // by it: a place is numbered by where it STANDS, and a dictated row above
      // it occupies one.
      for (let n = people.length + 1; n <= rows; n += 1) slots.push(S.slot(n))
    }
    return {
      army,
      label: army === 'crni' ? APP_STRINGS.ui.armyCrni : APP_STRINGS.ui.armyBili,
      count: total,
      threshold,
      // Nothing is missing from an evening that has been danced.
      below: !past && total < threshold,
      head: past ? String(total) : S.ofThreshold(total, threshold),
      people,
      slots,
      addRow: past && !confirmed ? S.addTo[army] : null,
    }
  }

  const columns = [column('crni', count.crni), column('bili', count.bili)]
  const bule = peopleOf('bula')

  const voditelji = experience
    ? lineup
        .filter((entry) => entry.role === 'voditelj')
        .map((entry) => personOf(entry.memberId, null))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'hr'))
    : []

  /** What a picker reads off a profile to decide about somebody. */
  type PickerProfile = { roles: DanceRole[]; primaryRole: DanceRole | null }

  /**
   * One picker, over the whole roster minus whoever is already in that list.
   *
   * `eligible` is who may be offered at all; `own` is who is offered FIRST.
   * They are the only two things that differ between the four.
   *
   * **An army picker offers everybody** (#633). Any moreškant may dance any
   * role if the evening truly needs it, so the profile no longer decides who
   * appears in "Dodaj u bile" but in what ORDER: the column's own army by
   * nickname, then everybody else under a caption. The bula is the exception in
   * both directions, because she only ever dances the bula and nobody else ever
   * dances her: she is the one person an army picker leaves out, and her own
   * card is the only one that lets her in.
   */
  function picker(
    title: string,
    already: readonly StanjePerson[],
    omitRole: DanceRole | null,
    eligible: (profile: PickerProfile) => boolean,
    own?: (profile: PickerProfile) => boolean,
  ): StanjePicker {
    const taken = new Set(already.map((person) => person.memberId))
    const people = detail.lineup.roster
      .filter((row) => !taken.has(row.memberId))
      .filter((row) => eligible(row))
      .map((row) => ({ ...personOf(row.memberId, null), outsider: own ? !own(row) : false }))
      .sort(
        (a, b) =>
          // The column's own army first, everybody else under the caption.
          Number(a.outsider) - Number(b.outsider) ||
          // Whoever said "ne dolazim" sinks to the bottom of their own half
          // rather than out of the list: adding them is usually a correction
          // and always deliberate.
          Number(a.answer === 'not_coming') - Number(b.answer === 'not_coming') ||
          a.nickname.localeCompare(b.nickname, 'hr'),
      )
    return { title, people, omitRole }
  }

  const inArmy = (army: Army) => (profile: { roles: DanceRole[] }) =>
    profile.roles.some((role) => ARMY_OF_ROLE[role] === army)

  /** The one person an army picker never offers (#633). */
  const notBula = (profile: PickerProfile) => profile.primaryRole !== 'bula'

  const pickers: Record<PickerKey, StanjePicker> = {
    crni: picker(S.addTo.crni, columns[0].people, 'crni', notBula, inArmy('crni')),
    bili: picker(S.addTo.bili, columns[1].people, 'bili', notBula, inArmy('bili')),
    // A bula is not a third value of the attendance army (glossary: *Army
    // count*), so she is picked by her PROFILE: every bula on the roster dances
    // the bula and nothing else, which is what makes the primary role the whole
    // of the rule here.
    bula: picker(S.addTo.bula, bule, 'bula', (profile) => profile.primaryRole === 'bula'),
    // Nothing on a profile says who may run an Experience, so nothing filters
    // this list. Who may WRITE it is the permission, and that is the route's.
    voditelj: picker(S.addVoditelj, voditelji, null, () => true),
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
    buleAddRow: !confirmed && bule.length === 0 ? S.addTo.bula : null,
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
    // `canAnswer` is the loader's own rule (not cancelled, not yet started), the
    // same one the hero on Moreška reads and the answer route enforces again.
    me:
      detail.myMemberId && p.canAnswer
        ? {
            memberId: detail.myMemberId,
            answer: answerOf.get(detail.myMemberId) ?? null,
          }
        : null,
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
    keepsList: detail.keepsList,
    // "Popis vodi: Ante Bačić" — drawn only when there IS one (#658). A
    // voditelj keeps every list without being named, so an absent line is not a
    // gap: it says the voditelji are running the night, as always.
    keptBy: detail.listKeepers.length
      ? K.kept(detail.listKeepers.map((keeper) => keeper.nickname).join(', '))
      : null,
    listKeepers: detail.listKeepers.map((keeper) => keeper.memberId),
    // The whole roster, for the Zaduženi sheet. It rides the same `roster` the
    // postava editor does, which is the list-keeper's only, so no other dancer's
    // browser receives it.
    keeperPicker: {
      title: K.title,
      people: detail.lineup.roster.map((row) => personOf(row.memberId, null)),
      omitRole: null,
    },
    // "Potvrdio: Ante Bačić · 20. kolovoza" — the signature, when there is one.
    confirmedBy:
      confirmed && detail.lineup.confirmedBy
        ? K.confirmedBy(detail.lineup.confirmedBy, confirmedDay(detail.lineup.confirmedAt))
        : null,
  }
}
