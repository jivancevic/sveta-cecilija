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
 * `today` is YYYY-MM-DD and bounds it at the other end: a postava is confirmed
 * AFTER the evening (CONTEXT.md → *Potvrđena postava*), but an evening
 * confirmed in advance must not become the front of the chain and break
 * everybody's niz before it has been danced.
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
  let run = 0
  chain.forEach((id, index) => {
    if (danced.has(id)) {
      run += 1
      // `>=` so a run that reaches the front wins a tie against an older one.
      const running = index - run + 1 === 0
      if (run > best || (run === best && running)) {
        best = run
        bestRunning = running
      }
    } else {
      run = 0
    }
  })
  return { length: best, running: best > 0 && bestRunning }
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

/**
 * Every dancer's running niz, keyed by member id.
 *
 * What a LIST needs: one pass over the chain's lineups rather than one pass per
 * dancer. A member with no run at all is absent from the map, and every reader
 * of it treats a missing key as zero.
 */
export function currentNizByMember(
  chain: readonly string[],
  lineups: readonly NizLineupRow[],
): Record<string, number> {
  const inChain = new Set(chain)
  const danced = new Map<string, Set<string>>()
  for (const row of lineups) {
    const performanceId = String(row.performanceId)
    if (!inChain.has(performanceId)) continue
    const memberId = String(row.memberId)
    let set = danced.get(memberId)
    if (!set) {
      set = new Set<string>()
      danced.set(memberId, set)
    }
    set.add(performanceId)
  }

  const out: Record<string, number> = {}
  for (const [memberId, set] of danced) {
    const run = currentNiz(chain, set)
    if (run > 0) out[memberId] = run
  }
  return out
}
