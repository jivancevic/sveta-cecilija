// What Moreška says, as pure functions over what the roster already loads
// (#565, decisions Q17, Q18, Q29, Q30, Q31, Q61, Q65).
//
// The screen is the dancer's: where am I next, am I going, and what is still
// ahead of me this season. Everything it prints is in the DANCER's register
// ("nastup", CONTEXT.md) and nothing it prints is a number of tickets — a seat
// count is the blagajna's business and lives one tab away on Izvedbe (Q29).
//
// Two rules here are worth more than the formatting they look like:
//
//   1. **An evening reads as its CATEGORY and nothing else** (Q30, widened to
//      three by #591): "Redovna", "Experience" or "Vanredna". Never the client,
//      never the kind name. A dancer turns up for the evening; which agency
//      booked it changes nothing about that, and the notebook has called the
//      rest "vandredni nastup" for decades (glossary: *Vanredna izvedba*). The
//      word and the tone both come from `performance-kind.ts`, which is the one
//      place that knows there are three. The guarantee is only as good as the
//      DATA, though: the row's free-text `location` IS printed, so a booking
//      whose ship was typed into the place rather than into `client` shows it
//      here and nothing in code can tell the difference.
//   2. **A mark means ONE of two things, and which one depends on where it is
//      drawn** (#612; the rule is written out in full in `RoleMark`'s header).
//      In an EVENING — Stanje, the postava, the hero — the disc is the army and
//      the glyph is that evening's title, because a titula belongs to one
//      lineup and never to a person (glossary: *Title*, Q65). In a PROFILE —
//      the identity block at the top of this screen — the disc is the army of
//      the reader's PRIMARY role and the glyph is that role, with every other
//      role they hold beside it as a small disc of its own. The two are never
//      mixed: a crni kralj by trade wears his crown on his own profile and a
//      plain ink disc in an evening he was not given the title for.
//
// No IO, no clock, no Payload: the page hands over the rows the seam loaded and
// gets back what to draw. `moreska-screen.test.ts` is where the rules are
// asserted, not a rendered page.

import type { AppMember } from './access'
import {
  APP_STRINGS,
  dayOfMonth,
  monthGenitiveOf,
  shortWeekday,
  weekdayLabel,
} from './strings'
import {
  pluralize,
  type HeroPick,
  type MonthGroup,
  type PostavaCount,
  type RosterPerformance,
} from './roster-loaders'
// Borrowed rather than re-derived: `daysBetween` is the one whole-calendar-day
// subtraction in `/app` (Početna's sentence uses it for the same purpose), and
// a second one here would be a second chance to get midnight wrong.
import { daysBetween } from './home-screen'
import { performancePlace } from './performance-place'
import { kindTone, kindWord, type KindTone } from './performance-kind'
import {
  ARMY_OF_ROLE,
  DANCE_ROLES,
  DANCE_ROLE_LABELS,
  isDanceRole,
  type DanceRole,
} from '@/lib/moreskant-profile'

/**
 * The one shape of the design system this module hands values to, restated
 * rather than imported: `src/lib/` must not depend on `src/app/`, and this is
 * the whole of the contract (`RoleMark`'s disc). The chip tone went with the
 * answer chip in #624, when the row's answer became two circles.
 */
type MarkArmy = 'crni' | 'bili' | 'bula'

const S = APP_STRINGS.moreska

/** How far out an evening is before the list stops counting: one week. */
const SOON_WINDOW_DAYS = 7

/**
 * "danas" / "sutra" / "za 3 dana" — how close an evening is, or null when it is
 * further out than a week (#612).
 *
 * **Calendar days, never hours.** The input is a whole-day difference computed
 * off the Europe/Zagreb day (`daysBetween`), which is the only counting that
 * matches what a dancer would say: at 23:50 tonight, tomorrow's 21:00 nastup is
 * 21 hours away and a 24-hour bucket would round it to "danas". It is "sutra",
 * because it is on a different day, and that is the whole reason the day
 * difference is computed upstream rather than from two timestamps here.
 *
 * Croatian takes "dana" for every count this function can reach: 1 is already
 * spoken as "sutra", and 2 through 7 are all "dana" (the `21 dan` / `22 dana`
 * split that `pluralize` exists for starts well outside the window). Nothing
 * here guesses a plural, which is why the window's edge is a rule rather than a
 * convenience.
 *
 * A day in the PAST yields null too: the season list's past half prints a month
 * heading, not a countdown to something that has happened.
 */
export function soonLabel(days: number | null): string | null {
  if (days === null || !Number.isFinite(days)) return null
  if (days < 0 || days > SOON_WINDOW_DAYS) return null
  if (days === 0) return S.soonToday
  if (days === 1) return S.soonTomorrow
  return S.soonInDays(days)
}

/** One row of the month list. */
export interface NastupRow {
  id: string
  href: string
  /** "14" */
  day: string
  /** "pon" */
  weekday: string
  /** Which of the three categories the evening is, for the disc (#591). */
  tone: KindTone
  /** "Redovna", "Vanredna" or "Experience". */
  title: string
  /** "21:00 · Ljetno kino", plus "· otkazano" when it is off. */
  meta: string
  cancelled: boolean
  /** Null for a reader with no Member row: they have no answer to report. */
  /**
   * The reader's own answer on a FUTURE nastup, or null when they have not
   * given one — and null on the whole past list, which is not answerable.
   *
   * It used to be a word chip ("bez odgovora" / "dolaziš"). Since #624 the row
   * carries the two circles instead, so what it needs is the STATE rather than
   * a label: the same evening reads as a green circle on the list and as a full
   * Dolazim button in the hero, and neither of them owns a second wording.
   */
  answer: 'coming' | 'not_coming' | null
  /** Whether those circles may be tapped: not cancelled, not yet started. */
  canAnswer: boolean
  /**
   * Whether this evening's postava was confirmed (#432).
   *
   * Carried on the row so the PAST list can say what happened without reaching
   * back into the performance the row was built from: a page that reads two
   * shapes to draw one row is a page where the two can disagree.
   */
  lineupConfirmed: boolean
  /**
   * Who danced: "7/9", seven crni and nine bili (#634).
   *
   * It replaced the green POPIS pill, which said that a list EXISTS. A dancer
   * reading the season backwards is not asking whether somebody typed the
   * evening up; they are asking how big it was. Null wherever there is no
   * confirmed postava, which the past list draws as a red "Nema popisa".
   */
  postava: PostavaCount | null
  /**
   * "danas" / "sutra" / "za 3 dana", beside the kind word, or null (#612).
   *
   * The SEASON LIST's own, and deliberately nowhere else: the hero already says
   * how close its evening is in a whole sentence, and Početna's one line does
   * the same. A third copy of the same fact on the same screen is not emphasis.
   *
   * Null whenever the caller did not hand over a day to count from, which is
   * how the past list opts out without a flag of its own: there is no countdown
   * to an evening that has happened.
   */
  soon: string | null
}

export interface NastupRowOptions {
  showAnswer: boolean
  /**
   * Today in Europe/Zagreb, YYYY-MM-DD, for the "za koliko dana" chip.
   *
   * Handed in rather than read off a clock, like every other date on this
   * screen: a component that called `new Date()` for itself would render one
   * answer on the server and, on a phone in another timezone, a different one
   * in the browser.
   */
  today?: string | null
}

export function nastupRow(performance: RosterPerformance, opts: NastupRowOptions): NastupRow {
  const place = performancePlace(performance)
  return {
    id: performance.id,
    href: `/app/moreska/${performance.id}`,
    day: dayOfMonth(performance.date),
    weekday: shortWeekday(performance.date),
    tone: kindTone(performance.kind),
    title: kindWord(performance.kind),
    meta: [performance.time, place, performance.cancelled ? S.cancelled : null]
      .filter(Boolean)
      .join(' · '),
    cancelled: performance.cancelled,
    answer: opts.showAnswer ? performance.myAnswer : null,
    // A past evening is read, not answered (#624), and the loader has already
    // said the same thing: `canAnswer` is false there anyway. Both are stated
    // because the list also draws rows the loader thinks are answerable and
    // this option is what says "this is the half nobody answers".
    canAnswer: opts.showAnswer && performance.canAnswer,
    lineupConfirmed: performance.lineupConfirmed,
    postava: performance.postava,
    // A cancelled evening gets no countdown: "za 2 dana" under "otkazano" reads
    // as a thing still coming, which is the one thing that row must not say.
    soon:
      opts.today && !performance.cancelled
        ? soonLabel(daysBetween(opts.today, performance.date))
        : null,
  }
}

/** One month of the list: the heading, its count, and the rows under it. */
export interface MonthSection {
  key: string
  /** "Rujan" */
  label: string
  /** "5 nastupa" — of evenings that happened, or are still going to. */
  aside: string
  rows: NastupRow[]
}

export function monthSections(
  groups: readonly MonthGroup[],
  opts: NastupRowOptions,
): MonthSection[] {
  return groups.map((group) => ({
    key: `${group.year}-${group.month}`,
    label: group.label,
    // A cancelled evening stays in the list but is not one of "5 nastupa" in
    // September: it did not and will not happen (#457 review, kept in #565).
    aside: pluralize(group.performances.filter((p) => !p.cancelled).length, S.count),
    rows: group.performances.map((p) => nastupRow(p, opts)),
  }))
}

/** "9 nastupa pred tobom" — what is still ahead of the reader this season. */
export function aheadLabel(upcoming: readonly RosterPerformance[]): string {
  return pluralize(upcoming.filter((p) => !p.cancelled).length, S.ahead)
}

/**
 * One of the reader's OTHER dance roles, as a 28px disc beside their name
 * (#612).
 *
 * A moreškant is rarely one thing: the notebook has people down as crni and
 * otmanović and bula across a season, and until now the screen printed exactly
 * one of them — the primary — and silently dropped the rest. A dancer reading
 * their own profile and finding half of what they do missing has no way to tell
 * a deliberate omission from a data-entry mistake in the Backoffice.
 *
 * Each small disc is a `RoleMark` in the PROFILE context (see that component's
 * header): its colour is that ROLE's army, not the reader's primary one, which
 * is why a crni who is also a bula wears one ink disc and one gold. The `label`
 * is the only text: the discs are an aria-label away from being a colour puzzle.
 */
export interface OtherRole {
  role: DanceRole
  /** The army of THIS role, which is not necessarily the reader's usual one. */
  army: MarkArmy
  /** "Bula" — the accessible name of a disc that is otherwise pure colour. */
  label: string
}

/** The block at the top: who the reader is, and what is left of their season. */
export interface Identity {
  /** The legal name, which is the one thing on this screen that is formal. */
  name: string
  /** "Crni kralj · 9 nastupa pred tobom" */
  line: string
  /** The disc: the army of the primary role. */
  army: MarkArmy | null
  /**
   * The primary role itself, for the big disc's glyph (#612).
   *
   * The identity block is a PROFILE context, so the mark it draws answers "who
   * is this person" and not "what were they given tonight" — a crni kralj by
   * trade wears the crown here whether or not anybody handed him the title for
   * the next evening. Null for a reader whose Member row carries no valid role,
   * which is the same case the line beside it reads as "bez uloge".
   */
  primaryRole: DanceRole | null
  /**
   * Every OTHER dance role the reader holds, in the profile form's own order.
   *
   * ALL of them, never truncated and never summarised as "+2": the whole list
   * is at most five discs, a phone fits five 28px discs beside a name and wraps
   * to a second line if it does not, and a "+2" on a person's own profile hides
   * exactly the fact they opened it for. The primary is NOT among them — it is
   * the big disc, and printing it twice would read as two separate roles.
   */
  others: OtherRole[]
}

/**
 * The reader's own identity, or null when the login carries no dancer (a
 * voditelj who does not dance, #419 story 15).
 *
 * **This block is a PROFILE, and #612 settled what that means for its mark.**
 * It used to draw the title of the next nastup's confirmed postava — a crown
 * that appeared and vanished as a voditelj worked — on the theory that a crown
 * anywhere in the app always means an evening. The theory was right about
 * Stanje and wrong here: this block is the answer to "who am I in this
 * society", and answering it with tonight's roster left a crni kralj by trade
 * looking at a bare ink disc on the one screen that is about him. So the mark
 * here is the PRIMARY ROLE's, the discs beside the name are the rest of the
 * roles, and the evening's title stays where it belongs — on Stanje, on the
 * postava, in the hero, where a person is shown IN an evening (`RoleMark`'s
 * header states the split; CONTEXT.md → *Title* is unchanged, because a titula
 * still lives in a lineup and not on a Member row).
 *
 * The army comes from the primary role and a bula, who is in neither army, gets
 * the gold disc that IS the bula's mark. Every other role the Member row
 * carries comes back in `others`, in `DANCE_ROLES` order — the profile form's
 * own — so two readers with the same set see the same discs in the same places.
 */
export function identityOf(me: AppMember | null | undefined, ahead: string): Identity | null {
  if (!me) return null
  const primary = isDanceRole(me.primaryRole) ? me.primaryRole : null
  const role = primary ? DANCE_ROLE_LABELS[primary] : APP_STRINGS.header.noRoles
  const army = primary ? (ARMY_OF_ROLE[primary] ?? 'bula') : null
  // A Set, because `roles` arrives raw off a Member row: a duplicate there is a
  // data slip nobody should have to see twice on their own profile.
  const held = new Set((me.roles ?? []).filter(isDanceRole))
  return {
    name: me.name?.trim() || me.nickname?.trim() || '',
    line: [role, ahead].filter(Boolean).join(' · '),
    army,
    primaryRole: primary,
    others: DANCE_ROLES.filter((r) => r !== primary && held.has(r)).map((r) => ({
      role: r,
      army: ARMY_OF_ROLE[r] ?? 'bula',
      label: DANCE_ROLE_LABELS[r],
    })),
  }
}

/**
 * ONE half of a split hero: a day with two nastupa on it (#591).
 *
 * A half is a whole evening in miniature — its own time, its own category, its
 * own answer and its own headcount — because the two evenings are two
 * questions: a dancer may be in the morning Experience and not in the 21:00
 * redovna. What a half deliberately does NOT carry is the ArmyBar: two bars
 * stacked under one date is a chart, and the bar belongs to the single hero and
 * to Stanje, where one evening has the screen to itself.
 */
export interface HeroHalf {
  id: string
  /** "21:00" — the big thing on a half, the way the day is on a single hero. */
  time: string
  /** "Redovna" / "Vanredna" / "Experience". */
  title: string
  tone: KindTone
  /**
   * The two headcounts, or null when they were not loaded.
   *
   * Counts rather than a line: the half draws "crni 7 · bili 5" with the words
   * muted and the numbers in ink (#592), which needs the two apart.
   */
  armies: { crni: number; bili: number } | null
  /** The reader's OWN answer on THIS evening, for this half's own buttons. */
  answer: 'coming' | 'not_coming' | null
  /** "Crni" / "Bili" as the server recorded it for this evening, or null. */
  army: string | null
  canAnswer: boolean
  href: string
}

/** The one card the screen is opened for. */
export interface HeroView {
  id: string
  /** "Sljedeći nastup · Ljetno kino" */
  eyebrow: string
  /** "14" */
  day: string
  /** "rujna" */
  month: string
  /** "Ponedjeljak · 21:00 · Redovna" */
  meta: string
  /**
   * The same line WITHOUT the kind: "Ponedjeljak · 21:00" (#592).
   *
   * The hero draws the kind as a chip beside it rather than as the third item
   * of a grey sentence, so it needs the two halves apart. `meta` stays as the
   * whole sentence for anything that wants one string.
   */
  metaLead: string
  /** "Redovna", "Vanredna" or "Experience", for that chip. Null on a split day. */
  kind: string | null
  /**
   * "DANAS" when the card's evening is TODAY in Europe/Zagreb, else null
   * (#612).
   *
   * Decided HERE, on the server, and handed over as a word rather than as a
   * boolean the page would have to find a string for. Two reasons it is not a
   * `new Date()` in a component: a phone in Vienna and a phone in Korčula must
   * agree about which day it is (they do not, for an hour a night), and a
   * client-side "is today" would flip the card's whole treatment on hydration.
   *
   * It is also the accessible half of that treatment. The gold edge and the
   * one-shot sweep around the card are decoration, and a reader with reduced
   * motion on, or no colour vision, sees neither; this word is what is left,
   * which is why it exists as a label and not as a CSS class.
   *
   * On a SPLIT day it follows the day, not one evening: both halves are on it.
   */
  todayLabel: string | null
  /** Which of the three categories the evening is, for the skin (#591). */
  tone: KindTone
  note: string | null
  /** Where the ArmyBar taps through to. */
  href: string
  /** The two headcounts and their thresholds, when they were loaded. */
  armies: { crni: number; bili: number; threshold: { crni: number; bili: number } } | null
  /**
   * Two evenings on the same day, or null for the ordinary single hero (#591).
   *
   * When it is set the card is the DAY rather than one evening: the header and
   * the big date are shared, each half answers for itself, and the fields above
   * still describe the first of the two so nothing that reads a hero breaks.
   */
  halves: HeroHalf[] | null
  /** "još 1 nastup taj dan ›" when the day holds more than the two halves. */
  moreLabel: string | null
}

function heroHalf(performance: RosterPerformance): HeroHalf {
  return {
    id: performance.id,
    time: performance.time,
    title: kindWord(performance.kind),
    tone: kindTone(performance.kind),
    armies: performance.chip
      ? { crni: performance.chip.crni.count, bili: performance.chip.bili.count }
      : null,
    answer: performance.myAnswer,
    army: armyLabel(performance.myArmy),
    canAnswer: performance.canAnswer,
    href: `/app/moreska/${performance.id}`,
  }
}

/**
 * The hero, from the day the loader picked (`pickHeroPerformances`).
 *
 * Both screens that draw a hero go through this one function, so Početna and
 * Moreška can never split a day differently or name the same evening two ways
 * — and since #612 they cannot disagree about whether it is tonight either.
 *
 * `today` is Europe/Zagreb's date, YYYY-MM-DD, handed in by the loader that
 * already holds the screen's one clock. Omitting it is not an error: it means
 * "do not decide", and the card is drawn plain.
 */
export function heroView(pick: HeroPick, opts: { today?: string | null } = {}): HeroView {
  const performance = pick.first
  const place = performancePlace(performance)
  const split = pick.second != null
  return {
    id: performance.id,
    // A split day has two places in it, so the eyebrow cannot name one: it
    // names the DAY instead, whole — "Sljedeći nastupi · 14. rujna ·
    // Ponedjeljak" — because it is the only head the split card has (#592).
    // The big serif date and the weekday line belong to the single hero: under
    // two halves they push the answers off a phone screen.
    eyebrow: split
      ? [
          S.nextTwo,
          `${dayOfMonth(performance.date)}. ${monthGenitiveOf(performance.date)}`,
          weekdayLabel(performance.date),
        ]
          .filter(Boolean)
          .join(' · ')
      : [S.next, place].filter(Boolean).join(' · '),
    day: dayOfMonth(performance.date),
    month: monthGenitiveOf(performance.date),
    meta: split
      ? weekdayLabel(performance.date)
      : [weekdayLabel(performance.date), performance.time, kindWord(performance.kind)]
          .filter(Boolean)
          .join(' · '),
    // A split day's halves carry their own kind, each with its own chip, so the
    // shared line above them names neither.
    metaLead: split
      ? weekdayLabel(performance.date)
      : [weekdayLabel(performance.date), performance.time].filter(Boolean).join(' · '),
    kind: split ? null : kindWord(performance.kind),
    // A string comparison, not a date arithmetic: both sides are already the
    // Zagreb calendar day as YYYY-MM-DD, and parsing them back into instants
    // to subtract would only reintroduce the timezone this format exists to
    // have settled.
    todayLabel: opts.today && opts.today === performance.date ? S.todayBadge : null,
    tone: kindTone(performance.kind),
    note: performance.voditeljNote,
    href: `/app/moreska/${performance.id}`,
    armies:
      // Never under a split hero: the bar is about ONE evening, and two of them
      // under one date say nothing a dancer can act on.
      !split && performance.chip
        ? {
            crni: performance.chip.crni.count,
            bili: performance.chip.bili.count,
            threshold: {
              crni: performance.chip.crni.threshold,
              bili: performance.chip.bili.threshold,
            },
          }
        : null,
    halves: pick.second ? [heroHalf(performance), heroHalf(pick.second)] : null,
    moreLabel: pick.moreCount > 0 ? `još ${pluralize(pick.moreCount, S.moreThatDay)} ›` : null,
  }
}

/** "Crni" / "Bili" — the army a landed answer counted in, for the hero's label. */
export function armyLabel(army: 'crni' | 'bili' | null): string | null {
  if (army === 'crni') return APP_STRINGS.ui.armyCrni
  if (army === 'bili') return APP_STRINGS.ui.armyBili
  return null
}
