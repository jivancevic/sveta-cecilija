// What Skener loads on the server (#504).
//
// One question: which performance is the door admitting people to, and how many
// are in. The answer is `getNextShow()` — the canonical active door show
// (CLAUDE.md hard rule: never query Shows from a page) — plus the live scanned
// count, run through the pure `doorProgress()` the old door dashboard already
// used. No money, no buyer list, no other performance: the door sees tonight
// and nothing else (ADR-0006).

import { doorProgress, type DoorProgress } from '@/lib/dashboard/door-progress'
import { getNextShow, getScannedPeopleForShow, type NextShow } from '@/lib/shows'

export interface DoorShow {
  /** The active door show, or null when the season has no evening left. */
  show: NextShow | null
  /** Admitted / sold / percent, or null when there is no show to count. */
  progress: DoorProgress | null
}

export async function loadDoorShow(): Promise<DoorShow> {
  const show = await getNextShow()
  if (!show) return { show: null, progress: null }
  const scanned = await getScannedPeopleForShow(show.id)
  return { show, progress: doorProgress(show, scanned) }
}

export type { DoorProgress, NextShow }
