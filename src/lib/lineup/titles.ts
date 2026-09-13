// The four titles of an evening (#566, glossary: *Title (titula)*).
//
// A title belongs to ONE performance's lineup, never to a person: the voditelj
// gives it for that nastup, and the profile's primary role decides only which
// army a "dolazim" counts in. So everything about a title is a fact about a
// `lineups` row, and everything below is a pure function over those rows.
//
// Four rules live here, each of them a sentence Stanje says in two places at
// once (the screen and the confirm route):
//
//   1. **Which titles an army may hold.** Crni: crni kralj and otmanović. Bili:
//      bili kralj. The bula is her own army of one. A title is offered in the
//      column the dancer is standing in tonight, so a crni cannot be handed the
//      bili kralj by tapping.
//   2. **Exactly one holder.** Giving a title to somebody takes it off whoever
//      held it, who falls back to the plain role of their own army. There is no
//      state in which two dancers wear one crown, so the screen never has to
//      explain one. The bula is the exception that proves it: her role IS her
//      title, so the dancer she takes it from leaves the postava rather than
//      staying in it as a "plain bula", which is not a thing.
//   3. **What the postava IS before anybody saves it.** The plain rows are the
//      attendance answers (`buildLineupFromAttendance`), FLATTENED to the plain
//      role of their army; the stored rows carry the titles, and a stored row
//      for somebody who was never asked is kept whole. `lineupWithTitles` is
//      the overlay, and it is what Stanje writes whenever a title moves, so the
//      saved postava always matches the answers on screen rather than the
//      answers as they were an hour ago, and never deletes a list somebody
//      dictated before the answers came in.
//   4. **A confirmed postava carries all four, once each** (CONTEXT.md, decided
//      2026-09-13). `checkTitles` is that rule, refused with a Croatian
//      sentence naming what is missing or doubled. An UNCONFIRMED write never
//      asks: the MCP tool and a half-filled evening both have to be writable.
//
// No IO, no Payload, no dates.

import {
  LINEUP_ROLE_LABELS,
  type DanceRole,
  type LineupRole,
} from '@/lib/moreskant-profile'
import type { LineupEntry } from './rules'

/** The four named parts of an evening, in the order they are read in. */
export const DANCE_TITLES = ['crni_kralj', 'otmanovic', 'bili_kralj', 'bula'] as const

export type DanceTitle = (typeof DANCE_TITLES)[number]

/**
 * The column a dancer stands in tonight. `bula` is a column of its own rather
 * than an army: a bula is in NEITHER army (glossary: *Army count*), which is
 * exactly why she cannot be counted towards a threshold and still needs a place
 * to be listed and a title of her own.
 */
export type TitleArmy = 'crni' | 'bili' | 'bula'

const TITLE_ARMY: Record<DanceTitle, TitleArmy> = {
  crni_kralj: 'crni',
  otmanovic: 'crni',
  bili_kralj: 'bili',
  bula: 'bula',
}

/** What a dancer falls back to when a title is taken off them. */
const PLAIN_OF_ARMY: Record<TitleArmy, DanceRole> = {
  crni: 'crni',
  bili: 'bili',
  bula: 'bula',
}

const TITLES = new Set<string>(DANCE_TITLES)

export function isDanceTitle(value: unknown): value is DanceTitle {
  return typeof value === 'string' && TITLES.has(value)
}

/** The titles this column may hold, in the order the sheet lists them. */
export function titlesForArmy(army: TitleArmy): DanceTitle[] {
  return DANCE_TITLES.filter((title) => TITLE_ARMY[title] === army)
}

/**
 * The column a lineup role puts a dancer in, or null for the `voditelj` line,
 * who is not dancing at all (glossary: *Voditelj (u postavi)*).
 */
export function armyOfLineupRole(role: LineupRole): TitleArmy | null {
  if (role === 'crni' || role === 'crni_kralj' || role === 'otmanovic') return 'crni'
  if (role === 'bili' || role === 'bili_kralj') return 'bili'
  if (role === 'bula') return 'bula'
  return null
}

/**
 * Give a title to one dancer, or take theirs away (`title: null`).
 *
 * Exactly one holder, so giving a title takes it off whoever had it. What
 * happens to them is where the bula differs from the other three: a demoted
 * king is still a dancer of his army and stays in the postava as a plain crni
 * or bili, while a bula has **no plain role to fall back to** — the role `bula`
 * IS the title (glossary: *Title*) — so she leaves the postava instead. She
 * still answered "dolazim" and still stands in the Bule card; she simply did
 * not dance the bula that evening, which is exactly what her absence from the
 * postava says, and it is what keeps her out of the season's bula count.
 *
 * A dancer with no row yet gets one, because the only way to hand the bula to
 * the second of two is to put her in the list the first one is leaving.
 */
export function assignTitle(
  entries: readonly LineupEntry[],
  input: { memberId: string; title: DanceTitle | null },
): LineupEntry[] {
  const out: LineupEntry[] = []
  let placed = false

  for (const entry of entries) {
    if (entry.memberId === input.memberId) {
      placed = true
      if (input.title) {
        out.push({ ...entry, role: input.title })
        continue
      }
      const army = armyOfLineupRole(entry.role)
      // Taking the bula away is taking her OUT: there is no plain bula.
      if (army === 'bula') continue
      out.push(army ? { ...entry, role: PLAIN_OF_ARMY[army] } : entry)
      continue
    }
    // Exactly one holder: whoever wore this title is a plain dancer again, or
    // out of the postava when the title was the bula.
    if (input.title && entry.role === input.title) {
      if (input.title === 'bula') continue
      out.push({ ...entry, role: PLAIN_OF_ARMY[TITLE_ARMY[input.title]] })
      continue
    }
    out.push(entry)
  }

  if (!placed && input.title) out.push({ memberId: input.memberId, role: input.title })
  return out
}

/**
 * The postava as Stanje means it: the answers, with the stored titles on top.
 *
 * `coming` is `buildLineupFromAttendance` over tonight's answers, which is the
 * live truth of who is dancing; `stored` is what the `lineups` table holds. The
 * overlay is deliberate and it is what keeps the two from drifting:
 *
 * - the derived roles are FLATTENED to the plain role of their army first. A
 *   suggestion built from attendance carries the dancer's primary role, so a
 *   crni kralj by trade would arrive wearing the crown — and a title comes from
 *   the evening, never from the profile (Q65). Only a STORED title decorates a
 *   name here;
 * - a stored title for somebody who has since said "ne dolazim" is DROPPED, so
 *   a crown never sits on an empty place;
 * - **a stored row for somebody who has not answered AT ALL is kept as it
 *   is**, role and title (#581 review). A postava can arrive without a single
 *   attendance answer under it: the MCP `set_lineup` tool records the paper
 *   list of an evening nobody was asked about (story 62), and so does the
 *   Backoffice editor. Deriving the list from answers alone would delete that
 *   work on the first title tap and leave an evening that can never be
 *   confirmed, because all four titles would be sitting on nobody. "No answer"
 *   is the ABSENCE of a row (glossary: *Attendance*), which is exactly what
 *   tells it apart from the "ne dolazim" above;
 * - a stored title whose army no longer matches the dancer's army tonight is
 *   dropped too, because a voditelj who moves a crni kralj across to the bili
 *   has moved a dancer, not a crown;
 * - **at most one bula is in the postava.** Her role is her title, so two bule
 *   would be two holders of one title and the evening could not be confirmed at
 *   all. The stored one wins as long as she has not said no; with none stored,
 *   the first coming one does, which is the ordinary evening where exactly one
 *   bula came. The other stands in the Bule card without being in the postava,
 *   and one tap moves the title across;
 * - a stored `voditelj` line is KEPT whatever the answers say: the member who
 *   runs the evening without dancing has no attendance answer to derive it
 *   from, and Stanje must not be the screen that quietly deletes it.
 */
export function lineupWithTitles(input: {
  coming: readonly LineupEntry[]
  stored: readonly LineupEntry[]
  /**
   * Every member with an attendance row of ANY kind, coming or not.
   *
   * It is the difference between "said no" and "was never asked", and the two
   * have opposite answers here: a stored row is dropped for the first and kept
   * for the second. Passing the coming ids alone would quietly delete every
   * postava entered before anybody answered.
   */
  answered: readonly string[]
}): LineupEntry[] {
  const titleOf = new Map<string, DanceTitle>()
  for (const entry of input.stored) {
    if (isDanceTitle(entry.role)) titleOf.set(entry.memberId, entry.role)
  }
  const comingIds = new Set(input.coming.map((entry) => entry.memberId))
  const answered = new Set(input.answered)
  /** A stored row survives unless its member answered something other than yes. */
  const survives = (memberId: string) => comingIds.has(memberId) || !answered.has(memberId)

  const storedBula = input.stored.find((entry) => entry.role === 'bula')?.memberId ?? null
  const comingBule = input.coming.filter((entry) => armyOfLineupRole(entry.role) === 'bula')
  const theBula =
    (storedBula && survives(storedBula) ? storedBula : null) ??
    comingBule[0]?.memberId ??
    null

  const out: LineupEntry[] = []
  for (const entry of input.coming) {
    const army = armyOfLineupRole(entry.role)
    if (army === 'bula') {
      if (entry.memberId !== theBula) continue
      out.push({ memberId: entry.memberId, role: 'bula' })
      continue
    }
    // The profile's crown does not travel: a plain role first, the evening's
    // own title on top of it.
    const plain: LineupEntry = army ? { ...entry, role: PLAIN_OF_ARMY[army] } : { ...entry }
    const title = titleOf.get(entry.memberId)
    out.push(title && TITLE_ARMY[title] === army ? { ...entry, role: title } : plain)
  }

  // The rows nobody answered for, verbatim: a dictated postava is a record, not
  // a suggestion, so neither the role nor the title is re-derived here.
  for (const entry of input.stored) {
    if (entry.role === 'voditelj') continue
    if (comingIds.has(entry.memberId) || answered.has(entry.memberId)) continue
    if (entry.role === 'bula' && entry.memberId !== theBula) continue
    if (out.some((row) => row.memberId === entry.memberId)) continue
    out.push({ ...entry })
  }

  const seen = new Set(out.map((entry) => entry.memberId))
  for (const entry of input.stored) {
    if (entry.role !== 'voditelj') continue
    const at = out.findIndex((row) => row.memberId === entry.memberId)
    if (at >= 0) out[at] = { ...out[at], role: 'voditelj' }
    else if (!seen.has(entry.memberId)) out.push({ ...entry })
  }

  return out
}

/** How many dancers wear each title right now. */
export type TitleCounts = Record<DanceTitle, number>

export function countTitles(roles: readonly LineupRole[]): TitleCounts {
  const counts: TitleCounts = { crni_kralj: 0, otmanovic: 0, bili_kralj: 0, bula: 0 }
  for (const role of roles) {
    if (isDanceTitle(role)) counts[role] += 1
  }
  return counts
}

/** "Titule N od 4": how many of the four have exactly one holder. */
export function titlesGiven(counts: TitleCounts): number {
  return DANCE_TITLES.filter((title) => counts[title] === 1).length
}

/** The sentence for a title nobody is wearing. Accusative, as it is spoken. */
const MISSING: Record<DanceTitle, string> = {
  crni_kralj: 'Postava nema crnog kralja.',
  otmanovic: 'Postava nema otmanovića.',
  bili_kralj: 'Postava nema bilog kralja.',
  bula: 'Postava nema bulu.',
}

/** "Dva plesača nose titulu Otmanović." */
function doubled(title: DanceTitle, n: number): string {
  const word: Record<number, string> = { 2: 'Dva', 3: 'Tri', 4: 'Četiri' }
  const who = word[n] ?? String(n)
  const verb = n >= 5 ? 'nosi' : 'nose'
  return `${who} plesača ${verb} titulu ${LINEUP_ROLE_LABELS[title]}.`
}

export type TitleCheck = { ok: true } | { ok: false; message: string }

/**
 * The four-title rule, applied ONLY when a postava is being confirmed.
 *
 * A confirmed lineup is what publishes an evening to the roster and what feeds
 * the season statistics, and an evening danced without a bila kralj is not an
 * evening anybody means. An unconfirmed write never asks: the MCP `set_lineup`
 * tool records a photograph of the paper list as it reads it (story 62), and a
 * voditelj filling the columns in during the afternoon is halfway through by
 * definition.
 *
 * The message names every problem rather than the first one, so a voditelj who
 * is two titles short reads both in one go instead of tapping Potvrdi twice.
 */
export function checkTitles(counts: TitleCounts): TitleCheck {
  const problems: string[] = []
  for (const title of DANCE_TITLES) {
    const n = counts[title]
    if (n === 0) problems.push(MISSING[title])
    else if (n > 1) problems.push(doubled(title, n))
  }
  return problems.length === 0 ? { ok: true } : { ok: false, message: problems.join(' ') }
}
