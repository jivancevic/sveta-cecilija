// Europe/Zagreb wall clock → absolute instant, for real (review fix on #426).
//
// A performance is stored as a `dayOnly` date plus an `HH:MM` local time, so
// turning it into an instant needs the zone's UTC offset ON THAT DAY. Until now
// that offset was the constant `+02:00` in `event-jsonld.ts`, which was exact
// only because ticketed shows run May-September (all CEST). Phase 3 broke that
// assumption: the roster reads the WHOLE calendar year, and the seeded
// non-public performances already reach mid-October — one week short of the
// 2026 DST switch. With a fixed +02:00 a November performance would look like
// it started an hour early, which would move it into "Prošle" an hour early and
// lock a dancer's answer an hour early with it.
//
// So compute the offset instead of assuming it. No new dependency: the ICU data
// behind `Intl.DateTimeFormat` already knows every Croatian transition, past and
// future, and Node ships it.

const ZONE = 'Europe/Zagreb'

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // h23, not hour12:false: some ICU versions render midnight as "24" under the
  // latter, which would put the instant a day out.
  hourCycle: 'h23',
})

/** The zone's UTC offset, in ms, at a given absolute instant. */
export function zagrebOffsetMsAt(instantMs: number): number {
  const parts = PARTS.formatToParts(new Date(instantMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asIfUtc - instantMs
}

/** "2026-08-14T00:00:00.000Z" or "2026-08-14" → "2026-08-14". */
export function dayOf(date: string): string {
  return date.length > 10 ? date.slice(0, 10) : date
}

/**
 * Epoch ms of a Europe/Zagreb wall clock reading.
 *
 * The offset is looked up at a first guess (the same numbers read as UTC) and
 * then re-checked at the instant that guess produces, so a reading on either
 * side of a transition resolves to the offset that actually applies to it. The
 * one genuinely ambiguous hour of the year — 02:00-03:00 on the autumn switch
 * day, which happens twice — lands on the SECOND pass, CET: the CEST guess
 * resolves to an instant that is already past the switch, so the re-check
 * disagrees and wins (02:30 becomes 01:30Z, the later of the two). No izvedba
 * has ever started at 02:00, and picking a side beats throwing.
 */
export function zagrebWallClockMs(date: string, time: string): number {
  const day = dayOf(date)
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(hh)) return Number.NaN

  const guess = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0)
  const firstOffset = zagrebOffsetMsAt(guess)
  const candidate = guess - firstOffset
  const secondOffset = zagrebOffsetMsAt(candidate)
  return secondOffset === firstOffset ? candidate : guess - secondOffset
}

/** The same offset as an ISO suffix ("+01:00" / "+02:00") for JSON-LD. */
export function zagrebOffsetIso(date: string, time: string): string {
  const ms = zagrebWallClockMs(date, time)
  if (Number.isNaN(ms)) return '+00:00'
  const offsetMin = zagrebOffsetMsAt(ms) / 60000
  const sign = offsetMin < 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  return `${sign}${pad(abs / 60)}:${pad(abs % 60)}`
}
