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
// The conversion is a REAL Europe/Zagreb zone conversion (`zagreb-time.ts`),
// not a fixed +02:00: the roster (#421) reads the whole calendar year, so a
// performance after the October DST switch has to resolve at +01:00 or it looks
// an hour early everywhere it is compared to `now`.
import { zagrebWallClockMs } from './zagreb-time'

/**
 * How long after a show's start time it stays publicly listed and purchasable
 * online. Korčula (Europe/Zagreb) wall clock.
 */
export const SHOW_GRACE_MS = 60 * 60 * 1000 // 1 hour

/** Epoch ms of a show's start, combining its dayOnly `date` with `HH:MM` local time. */
export function showStartMs(date: string, time: string): number {
  return zagrebWallClockMs(date, time)
}

/**
 * True once `nowMs` is past the show's start + {@link SHOW_GRACE_MS} window —
 * i.e. the show should no longer be sold online or shown to the public.
 */
export function isPastShowCutoff(date: string, time: string, nowMs: number = Date.now()): boolean {
  return nowMs > showStartMs(date, time) + SHOW_GRACE_MS
}
