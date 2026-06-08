// Canonical "is this show still current?" time logic.
//
// Shows.date is a Payload `dayOnly` value stored at midnight UTC, and the start
// time lives in a separate `time` (HH:MM) field. On its own the date makes a
// show look past for the whole calendar day (in any timezone east of UTC the
// stored midnight is already behind local wall-clock). We combine date + time
// into the real Europe/Zagreb (Korčula) start instant and keep the show
// "current" for a grace window after it begins, so:
//   - the public schedule keeps listing a show until 1h after it starts, and
//   - online checkout stays open for that same window (late walk-up buyers).
//
// `buildStartDate` applies the summer-season +02:00 offset; ticketed shows only
// run May–September (all CEST), so that offset is exact for every real show.
import { buildStartDate } from './event-jsonld'

/**
 * How long after a show's start time it stays publicly listed and purchasable
 * online. Korčula (Europe/Zagreb) wall clock.
 */
export const SHOW_GRACE_MS = 60 * 60 * 1000 // 1 hour

/** Epoch ms of a show's start, combining its dayOnly `date` with `HH:MM` local time. */
export function showStartMs(date: string, time: string): number {
  return new Date(buildStartDate(date, time)).getTime()
}

/**
 * True once `nowMs` is past the show's start + {@link SHOW_GRACE_MS} window —
 * i.e. the show should no longer be sold online or shown to the public.
 */
export function isPastShowCutoff(date: string, time: string, nowMs: number = Date.now()): boolean {
  return nowMs > showStartMs(date, time) + SHOW_GRACE_MS
}
