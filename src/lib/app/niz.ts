// The niz (#628). Glossary: CONTEXT.md → *Niz*.
//
// **Niz**: the unbroken run of confirmed Moreška postave, counted backwards
// from the most recent one danced. It is the one number on Ljestvica that is
// not a count of a season — it is a statement about form, which is why it is
// drawn as a flame and why it disappears the moment it stops being true.
//
// Everything here is pure and testable without a database, because the whole
// decision lives in which evenings make up the CHAIN. Once the chain is right,
// a niz is the length of the run of chain entries the dancer is in, counted
// from the front.
//
// The four rules the chain encodes, all settled on the prototype (#628):
//
//   - **Only a confirmed postava is a link.** A draft is a half-typed list and
//     says nothing about who danced, which is the rule every other count in
//     this app applies (`lib/lineup/stats.ts`).
//   - **An Experience neither counts nor breaks.** It is not a moreška, and
//     Ljestvica already keeps the two lists apart, so it is not in the chain
//     at all rather than being a link somebody can miss.
//   - **A cancelled evening is skipped, not a break.** Nobody danced it and
//     nobody could have.
//   - **A past evening that was never confirmed is skipped, not a break.** Its
//     absence is an unfinished record, not somebody's fault.
//
// And one rule that is about the chain's SHAPE rather than its links: **it
// crosses seasons.** A niz that reset in January would die every winter, and
// the season a dancer is in the middle of would never carry one.

import type { PerformanceKind } from '@/lib/show-performance'

/**
 * How long a niz has to be before it is drawn at all.
 *
 * Three, lowered from four when the prototype was answered (2026-09-15): at
 * four the flame was rare enough that a reader could scroll the whole list
 * without meeting one.
 */
export const NIZ_MIN = 3

/**
 * How far back a LIST reads the chain.
 *
 * The chain crosses seasons, so left unbounded the query behind the flame on
 * Ljestvica would grow with the archive for a number nobody can reach: sixty
 * consecutive moreške is about two full seasons of never missing an evening.
 * A run longer than the window reports the window, which is a cap on a number
 * that has never existed rather than a wrong answer to a question anybody asks.
 *
 * The PROFILE does not use it: "Najduži niz" is a record across all seasons
 * and reads the whole chain for one dancer, which is a small query.
 */
export const NIZ_WINDOW = 60

/** One performance, flattened to what the chain has to decide about. */
export interface NizPerformance {
  id: string
  /** YYYY-MM-DD. */
  date: string
  kind: PerformanceKind
  confirmed: boolean
  cancelled: boolean
}

/**
 * The chain: the confirmed moreške that have been danced, newest first.
 *
 * `today` is YYYY-MM-DD and bounds it at the other end: **today's evening is
 * IN** as soon as it is confirmed, and tomorrow's never is. A postava is
 * confirmed after the evening it records, so in practice the bound only ever
 * excludes a lineup somebody typed ahead of time — and including today is the
 * half that matters to a dancer, because a niz that only moved the next
 * morning would be a day behind the rehearsal it is talked about at.
 *
 * Ties on the date are broken by id, so two evenings on one day always come out
 * in the same order and a niz cannot change between two renders of one season.
 */
export function nizChain(
  performances: readonly NizPerformance[],
  today: string,
): string[] {
  return performances
    .filter(
      (p) =>
        p.confirmed &&
        !p.cancelled &&
        p.kind !== 'experience' &&
        p.date <= today,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((p) => p.id)
}

/**
 * The niz that is still running: how many of the most recent evenings in a row
 * this dancer was in.
 *
 * Zero the moment they missed the last one, which is the whole point — a
 * broken run is not a shorter run, it is no run (#628). What a dancer did
 * before the gap is the profile's business, not the list's.
 */
export function currentNiz(chain: readonly string[], danced: ReadonlySet<string>): number {
  let count = 0
  for (const id of chain) {
    if (!danced.has(id)) break
    count += 1
  }
  return count
}

/** The longest run this dancer has ever had, and whether it is the one going now. */
export interface LongestNiz {
  length: number
  /** The run reaches the front of the chain: it has not been broken. */
  running: boolean
  /**
   * The OLDEST evening of the run, and the NEWEST one in it, as chain ids
   * (#634). Both null for a dancer with no run at all.
   *
   * "Do" is the newest evening the dancer actually DANCED, never the one they
   * missed: the run is theirs and not the gap's. The profile turns the two into
   * "Od 14.7. do 19.8.", or "Traje od 14.7." while it is still going.
   */
  from: string | null
  to: string | null
}

/**
 * The record: the longest run anywhere in the chain.
 *
 * `running` is what lets the profile say "i još traje" rather than printing a
 * year back at a reader who is living in it. A tie between a finished run and
 * the one still going is won by the one still going, for the same reason
 * `bestSeason` used to give the most recent season a tie: the record a dancer
 * can still do something about is the one worth saying out loud.
 *
 * Zero length for a dancer who has danced nothing; the screen says so in words.
 */
export function longestNiz(chain: readonly string[], danced: ReadonlySet<string>): LongestNiz {
  let best = 0
  let bestRunning = false
  let bestEnd = -1
  let run = 0
  // **The tie rule is the ORDER, not a comparison.** The chain is newest first,
  // so a run that is still going is the first one this loop meets; every older
  // run of the same length then fails the strict `>` and leaves it standing.
  // Spelling the tie out as a second clause would be dead code.
  chain.forEach((id, index) => {
    if (!danced.has(id)) {
      run = 0
      return
    }
    run += 1
    if (run > best) {
      best = run
      // The run occupies [index - run + 1 .. index]; it is still going when it
      // starts at the front of the chain.
      bestRunning = index - run + 1 === 0
      bestEnd = index
    }
  })
  // The chain is NEWEST first, so the run's last index is its oldest evening
  // and the index `best - 1` above it is its newest. Both are evenings this
  // dancer danced, by construction: the loop only ever extends a run over ids
  // in `danced`.
  const from = best > 0 ? (chain[bestEnd] ?? null) : null
  const to = best > 0 ? (chain[bestEnd - best + 1] ?? null) : null
  return { length: best, running: best > 0 && bestRunning, from, to }
}

/**
 * The number the flame carries, or null for no flame at all.
 *
 * One state, not two (#628): the flame is only ever drawn for a run that is
 * still running, so there is nothing to draw hollow. `currentNiz` is already
 * zero for a broken run, which is why this takes one number and not two.
 */
export function flameNiz(current: number): number | null {
  return current >= NIZ_MIN ? current : null
}

/** One lineup row, flattened to ids. */
export interface NizLineupRow {
  performanceId: string
  memberId: string
}

/** Every dancer's RUNNING niz, keyed by member id; a dancer with none is absent. */
export function currentNizByMember(
  chain: readonly string[],
  lineups: readonly NizLineupRow[],
): Record<string, number> {
  return nizByMember(chain, lineups, currentNiz)
}

/**
 * Every dancer's LONGEST run inside one chain, keyed by member id (#634).
 *
 * The chip that ranks Ljestvica by the niz. It is the same shape as the one
 * above and deliberately not the same number: a list ranked by the running niz
 * would be mostly zeros, because a run is broken the moment somebody misses an
 * evening and most of the roster has missed one.
 *
 * **What makes it a SEASON's number is the CHAIN handed in**, not anything
 * here: give it the season's evenings and a run that crossed New Year counts
 * only the part inside the year on display, which is what every other number on
 * that screen is. The function itself knows nothing about years.
 */
export function longestNizByMember(
  chain: readonly string[],
  lineups: readonly NizLineupRow[],
): Record<string, number> {
  return nizByMember(chain, lineups, (c, danced) => longestNiz(c, danced).length)
}

/**
 * One pass over the chain's lineups, folded per dancer.
 *
 * What a LIST needs: a pass per screen rather than a pass per dancer. A member
 * with no run at all is absent from the map, and every reader of one treats a
 * missing key as zero.
 */
function nizByMember(
  chain: readonly string[],
  lineups: readonly NizLineupRow[],
  run: (chain: readonly string[], danced: ReadonlySet<string>) => number,
): Record<string, number> {
  const inChain = new Set(chain)
  const danced = new Map<string, Set<string>>()
  for (const row of lineups) {
    const { performanceId, memberId } = row
    if (!inChain.has(performanceId)) continue
    let set = danced.get(memberId)
    if (!set) {
      set = new Set<string>()
      danced.set(memberId, set)
    }
    set.add(performanceId)
  }

  const out: Record<string, number> = {}
  for (const [memberId, set] of danced) {
    const length = run(chain, set)
    if (length > 0) out[memberId] = length
  }
  return out
}
