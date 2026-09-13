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
//   1. **A non-regular evening reads "Vanredna" and nothing else** (Q30). Never
//      the client, never the kind name. A dancer turns up for the evening;
//      which agency booked it changes nothing about that, and the notebook has
//      called them "vandredni nastup" for decades (glossary: *Vanredna
//      izvedba*). The guarantee is only as good as the DATA, though: the row's
//      free-text `location` IS printed, so a booking whose ship was typed into
//      the place rather than into `client` shows it here and nothing in code
//      can tell the difference.
//   2. **The mark on a name is the ARMY of their primary role; the crown on it
//      is THIS EVENING's title.** A title belongs to one performance's lineup
//      rather than to a person (glossary: *Title*, Q65), so the disc comes from
//      the profile and the glyph comes from the next nastup's CONFIRMED postava
//      (#566) — a crni kralj by trade wears a plain ink disc on an evening he
//      was not given the title, while the line beside it still says "Crni
//      kralj", which is the profile fact it is.
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
import { pluralize, type MonthGroup, type RosterPerformance } from './roster-loaders'
import { performancePlace } from './performance-place'
import { ARMY_OF_ROLE, DANCE_ROLE_LABELS, isDanceRole } from '@/lib/moreskant-profile'

/**
 * The two shapes of the design system this module hands values to, restated
 * rather than imported: `src/lib/` must not depend on `src/app/`, and these are
 * the whole of the contract (`RoleMark`'s disc and `Chip`'s tone).
 */
type MarkArmy = 'crni' | 'bili' | 'bula'
type DanceTitle = 'crni_kralj' | 'otmanovic' | 'bili_kralj' | 'bula'
type ChipTone = 'plain' | 'gold' | 'warn'

const S = APP_STRINGS.moreska

/** The only two words a nastup is named by on this screen (Q30). */
export function nastupTitle(performance: { kind: string }): string {
  return performance.kind === 'redovna' ? S.regular : S.extra
}

/** The chip on a row: the reader's own answer, or its absence. */
export interface AnswerChip {
  label: string
  tone: ChipTone
}

export function answerChip(answer: 'coming' | 'not_coming' | null): AnswerChip {
  if (answer === 'coming') return { label: S.chipYes, tone: 'gold' }
  if (answer === 'not_coming') return { label: S.chipNo, tone: 'plain' }
  return { label: S.chipNone, tone: 'plain' }
}

/** One row of the month list. */
export interface NastupRow {
  id: string
  href: string
  /** "14" */
  day: string
  /** "pon" */
  weekday: string
  /** Gold disc: a Redovna, the evening the society exists for. */
  gold: boolean
  /** "Redovna" or "Vanredna". */
  title: string
  /** "21:00 · Ljetno kino", plus "· otkazano" when it is off. */
  meta: string
  cancelled: boolean
  /** Null for a reader with no Member row: they have no answer to report. */
  chip: AnswerChip | null
}

export function nastupRow(
  performance: RosterPerformance,
  opts: { showAnswer: boolean },
): NastupRow {
  const place = performancePlace(performance)
  return {
    id: performance.id,
    href: `/app/moreska/${performance.id}`,
    day: dayOfMonth(performance.date),
    weekday: shortWeekday(performance.date),
    gold: performance.kind === 'redovna',
    title: nastupTitle(performance),
    meta: [performance.time, place, performance.cancelled ? S.cancelled : null]
      .filter(Boolean)
      .join(' · '),
    cancelled: performance.cancelled,
    chip: opts.showAnswer ? answerChip(performance.myAnswer) : null,
  }
}

/** One month of the list: the heading, its count, and the rows under it. */
export interface MonthSection {
  key: string
  /** "Rujan" */
  label: string
  /** "5 nastupa" — of evenings that are still going to happen. */
  aside: string
  rows: NastupRow[]
}

export function monthSections(
  groups: readonly MonthGroup[],
  opts: { showAnswer: boolean },
): MonthSection[] {
  return groups.map((group) => ({
    key: `${group.year}-${group.month}`,
    label: group.label,
    // A cancelled evening stays in the list but is not one of "5 nastupa" in
    // September: it is not going to happen (#457 review, kept in #565).
    aside: pluralize(group.performances.filter((p) => !p.cancelled).length, S.count),
    rows: group.performances.map((p) => nastupRow(p, opts)),
  }))
}

/** "9 nastupa pred tobom" — what is still ahead of the reader this season. */
export function aheadLabel(upcoming: readonly RosterPerformance[]): string {
  return pluralize(upcoming.filter((p) => !p.cancelled).length, S.ahead)
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
   * The glyph: the title the reader wears in the NEXT nastup's CONFIRMED
   * postava, and nothing else (#566).
   *
   * Never the profile (glossary: *Title*, Q65). Until the voditelj hands the
   * four out on Stanje, everyone who said "dolazim" is a plain crni, bili or
   * bula, and the primary role decides only which army their answer counts in
   * — so a dancer whose primary role is `crni_kralj` wears the ink disc with no
   * crown until he is given the title for that evening, and the line beside the
   * mark still says "Crni kralj", which is the profile fact this block is for.
   * An UNCONFIRMED postava yields nothing either: a crown a voditelj is still
   * moving around is not news a dancer may read (story 34).
   */
  title: DanceTitle | null
}

/**
 * The reader's own identity, or null when the login carries no dancer (a
 * voditelj who does not dance, #419 story 15).
 *
 * The army comes from the primary role and a bula, who is in neither army, gets
 * the gold disc that IS the bula's mark. The title is the caller's, read off
 * the next nastup's confirmed postava: nothing here reads a row of its own, and
 * the army tonight's answer counted in still belongs to the evening rather than
 * to this block.
 */
export function identityOf(
  me: AppMember | null | undefined,
  ahead: string,
  /** The title of the NEXT nastup's confirmed postava, when the reader has one. */
  title: DanceTitle | null = null,
): Identity | null {
  if (!me) return null
  const primary = isDanceRole(me.primaryRole) ? me.primaryRole : null
  const role = primary ? DANCE_ROLE_LABELS[primary] : APP_STRINGS.header.noRoles
  const army = primary ? (ARMY_OF_ROLE[primary] ?? 'bula') : null
  return {
    name: me.name?.trim() || me.nickname?.trim() || '',
    line: [role, ahead].filter(Boolean).join(' · '),
    army,
    // Never from the profile: the evening's own title, or none.
    title,
  }
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
  note: string | null
  /** Where the ArmyBar taps through to. */
  href: string
  /** The two headcounts and their thresholds, when they were loaded. */
  armies: { crni: number; bili: number; threshold: { crni: number; bili: number } } | null
}

export function heroView(performance: RosterPerformance): HeroView {
  const place = performancePlace(performance)
  return {
    id: performance.id,
    eyebrow: [S.next, place].filter(Boolean).join(' · '),
    day: dayOfMonth(performance.date),
    month: monthGenitiveOf(performance.date),
    meta: [weekdayLabel(performance.date), performance.time, nastupTitle(performance)]
      .filter(Boolean)
      .join(' · '),
    note: performance.voditeljNote,
    href: `/app/moreska/${performance.id}`,
    armies: performance.chip
      ? {
          crni: performance.chip.crni.count,
          bili: performance.chip.bili.count,
          threshold: { crni: performance.chip.crni.threshold, bili: performance.chip.bili.threshold },
        }
      : null,
  }
}

/** "Crni" / "Bili" — the army a landed answer counted in, for the hero's label. */
export function armyLabel(army: 'crni' | 'bili' | null): string | null {
  if (army === 'crni') return APP_STRINGS.ui.armyCrni
  if (army === 'bili') return APP_STRINGS.ui.armyBili
  return null
}
