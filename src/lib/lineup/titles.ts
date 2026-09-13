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
//      explain one.
//   3. **What the postava IS before anybody saves it.** The plain rows are the
//      attendance answers (`buildLineupFromAttendance`); the stored rows carry
//      the titles. `lineupWithTitles` is the overlay, and it is what Stanje
//      writes whenever a title moves, so the saved postava always matches the
//      answers on screen rather than the answers as they were an hour ago.
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
 * The previous holder is demoted to the plain role of their own army, never
 * removed from the postava: they are still dancing, they are simply not the
 * king any more. A dancer who is not in the list yet cannot be given a title
 * here — the caller builds the list from the answers first
 * ({@link lineupWithTitles}), so somebody with no "dolazim" has no row to
 * decorate.
 */
export function assignTitle(
  entries: readonly LineupEntry[],
  input: { memberId: string; title: DanceTitle | null },
): LineupEntry[] {
  return entries.map((entry) => {
    if (entry.memberId === input.memberId) {
      if (input.title) return { ...entry, role: input.title }
      const army = armyOfLineupRole(entry.role)
      return army ? { ...entry, role: PLAIN_OF_ARMY[army] } : entry
    }
    // Exactly one holder: whoever wore this title is a plain dancer again.
    if (input.title && entry.role === input.title) {
      return { ...entry, role: PLAIN_OF_ARMY[TITLE_ARMY[input.title]] }
    }
    return entry
  })
}

/**
 * The postava as Stanje means it: the answers, with the stored titles on top.
 *
 * `coming` is `buildLineupFromAttendance` over tonight's answers, which is the
 * live truth of who is dancing; `stored` is what the `lineups` table holds. The
 * overlay is deliberate and it is what keeps the two from drifting:
 *
 * - a stored title for somebody who has since said "ne dolazim" is DROPPED, so
 *   a crown never sits on an empty place;
 * - a stored title whose army no longer matches the dancer's army tonight is
 *   dropped too, because a voditelj who moves a crni kralj across to the bili
 *   has moved a dancer, not a crown;
 * - a stored `voditelj` line is KEPT whatever the answers say: the member who
 *   runs the evening without dancing has no attendance answer to derive it
 *   from, and Stanje must not be the screen that quietly deletes it.
 */
export function lineupWithTitles(input: {
  coming: readonly LineupEntry[]
  stored: readonly LineupEntry[]
}): LineupEntry[] {
  const titleOf = new Map<string, DanceTitle>()
  for (const entry of input.stored) {
    if (isDanceTitle(entry.role)) titleOf.set(entry.memberId, entry.role)
  }

  const out: LineupEntry[] = input.coming.map((entry) => {
    const title = titleOf.get(entry.memberId)
    if (title && TITLE_ARMY[title] === armyOfLineupRole(entry.role)) {
      return { ...entry, role: title }
    }
    return entry
  })

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
