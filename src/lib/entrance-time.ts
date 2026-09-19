// When the gate opens (#674).
//
// The entrance to the Summer Cinema opens about half an hour before the start
// and there is nobody at it before then, which is how a party of six stood in
// front of a locked gate on 14 September 2026, left, and asked for their €100
// back: nothing we send a buyer had ever told them when to come.
//
// It is derived from the start time rather than stored on Shows because it has
// been the same half hour every evening of the season, the same way capacity is
// derived per venue and never stored (`VENUE_CAPACITY`). If an evening ever
// genuinely opens at its own hour, that is when it earns a column.
//
// Every surface words it as "around" / "oko": the half hour is what happens
// almost every time, not a promise timed to the minute, and a buyer who waits
// five minutes at an open-air gate has not been misled.

export const ENTRANCE_OPENS_MINUTES_BEFORE = 30

/**
 * The entrance time for a show that starts at `startTime` ("21:00" → "20:30").
 *
 * Returns null when the start time is not a time we can read, so a caller shows
 * no entrance line at all rather than a confidently wrong one. `shows.time` is a
 * varchar, so this is a real possibility and not defensive noise.
 */
export function entranceTime(startTime: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(startTime.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null

  const total = hours * 60 + minutes - ENTRANCE_OPENS_MINUTES_BEFORE
  // A show starting before 00:30 would wrap to the previous day. No performance
  // does, and an entrance "yesterday" would be worse than saying nothing.
  if (total < 0) return null

  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}
