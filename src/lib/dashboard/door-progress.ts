// Pure door-progress logic for the tehnika (door) dashboard (#240, ADR-0015).
//
// The door volunteer cares about one number: how many people have been admitted
// (scanned in) out of how many are sold for the active door show. This module
// keeps that derivation pure and unit-tested; the React component only formats
// it. No revenue, no PII — admitted/sold counts only.

import type { NextShow } from '@/lib/shows'

export interface DoorProgress {
  /** People admitted (scanned in) so far. */
  admitted: number
  /** People sold for the active show: online + in-person. */
  sold: number
  /** Admitted as a 0-100 integer percent of sold (0 when nothing is sold). */
  percent: number
}

/**
 * Total people sold for a show under the per-person ticket model (ADR-0007):
 * online active tickets plus in-person counter. Never negative.
 */
export function soldPeople(next: Pick<NextShow, 'onlineSold' | 'inPersonSold'>): number {
  return Math.max(0, (next.onlineSold ?? 0) + (next.inPersonSold ?? 0))
}

/**
 * Derive the admitted/sold progress for the active door show.
 *
 * `next` is the active door show (getNextShow()), or null when there is no
 * show tonight — in which case there is no progress to show and callers render
 * the "Nema predstave večeras." empty state instead.
 *
 * `scannedPeople` is the live count of people scanned in
 * (getScannedPeopleForShow). It is clamped so admitted never exceeds sold and
 * never goes negative, keeping the ring/bar well-formed.
 */
export function doorProgress(
  next: Pick<NextShow, 'onlineSold' | 'inPersonSold'> | null,
  scannedPeople: number,
): DoorProgress | null {
  if (!next) return null

  const sold = soldPeople(next)
  const admitted = Math.min(sold, Math.max(0, scannedPeople ?? 0))
  const percent = sold > 0 ? Math.round((admitted / sold) * 100) : 0

  return { admitted, sold, percent }
}
