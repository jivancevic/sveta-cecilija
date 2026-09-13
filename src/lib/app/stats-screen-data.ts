// Statistika's wiring (#508): the real repository, and nothing else.
//
// The `detail-data.ts` shape — everything the screen actually decides is in
// `stats-screen-loaders.ts` (which season, which reads, in what order) and
// `stats-screen.ts` (what the numbers mean), both of which take their inputs
// and so need no database to test. This file exists only so the page does not
// have to know that `getRepo()` is where a repository comes from.

import { getRepo } from '@/lib/repo'
import { loadStatsSeason, type LoadStatsOptions } from './stats-screen-loaders'
import type { StatsScreen } from './stats-screen'

export async function getStatsScreen(
  requested: unknown,
  options: LoadStatsOptions,
): Promise<StatsScreen> {
  return loadStatsSeason(getRepo().stats, requested, options)
}
