// What Gratis loads on the server (#506).
//
// The IO wiring and nothing else, in the `sell-data.ts` shape: every rule about
// what the form may do lives in `comp-screen.ts`, every statement lives in
// `lib/comp/comp-report.ts`, and this file only asks. It reaches the database
// through `getRepo()` (ADR-0027 decision 5), so it imports no Payload and needs
// no entry in the repo guard's allow-list.
//
// The performance picker goes through `getUpcomingShows()` rather than any repo
// method, because that is the CLAUDE.md entry point for show data: it applies
// the public-performance predicate and derives `remaining` from the venue's
// capacity, which is exactly the number a comp consumes.
//
// Named `comp-screen-data` and not `comp-data`: `lib/app/comp-data.ts` is the
// dancer's own four tickets (#434) and stays untouched.

import { getRepo } from '@/lib/repo'
import { getUpcomingShows } from '@/lib/shows'
import { resolveSeason, seasonOptions } from '@/lib/lineup/stats'
import { seasonYear } from '@/lib/member/season'
import type { CompOrderRow } from '@/lib/comp/comp-report'
import {
  tallyCompsByMember,
  type CompMemberTally,
  type MemberOption,
} from './comp-screen'
import { sellOptions, type SellOption } from './partner-screen'

/** How many comps "Zadnji gratisi" server-renders. */
export const RECENT_COMPS = 8

export interface CompScreen {
  /** The performances a comp may be issued for, soonest first. */
  shows: SellOption[]
  /** Who a comp may be attributed to (ADR-0019: attribution is required). */
  members: MemberOption[]
  /** The newest comps, for Poništi gratis. */
  recent: CompOrderRow[]
  /** "Gratis po članu" for the season in view. */
  perMember: CompMemberTally[]
  season: number
  /** Every season with the current one, newest first, for the picker. */
  seasons: number[]
}

/**
 * The whole screen in one pass.
 *
 * `requested` is the raw `?season=` value; an unknown or mistyped year falls
 * back to the current season the way Ljestvica does, because a bad URL should
 * show this year's table rather than an error page.
 */
export async function loadCompScreen(requested: unknown): Promise<CompScreen> {
  const repo = getRepo()
  const current = seasonYear(new Date())

  const [shows, members, recent, firstSeason] = await Promise.all([
    getUpcomingShows(),
    repo.members.listActive(),
    repo.comp.recent(RECENT_COMPS),
    repo.comp.firstSeason(),
  ])

  const seasons = seasonOptions(firstSeason, current)
  const season = resolveSeason(requested, current, seasons)
  const perMember = tallyCompsByMember(await repo.comp.ticketsInSeason(season))

  return { shows: sellOptions(shows), members, recent, perMember, season, seasons }
}

export type { CompMemberTally, CompOrderRow, MemberOption, SellOption }
