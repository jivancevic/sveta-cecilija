// When a notification arrived, as the inbox says it (#496).
//
// Pure, and Zagreb throughout. The rows are read in Korčula and filed by a
// server in Nuremberg, so "danas" has to be a reading of the Zagreb wall clock
// rather than of UTC: a row filed at 00:30 CEST would otherwise read as "jučer"
// for two hours every night. The project's other date labels take the same care
// for the same reason (`src/lib/zagreb-time.ts`).

import { APP_STRINGS, MONTHS_GENITIVE } from './strings'

const ZAGREB = 'Europe/Zagreb'

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZAGREB,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** The Zagreb wall clock of an instant, as `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`. */
function zagrebParts(ms: number): { date: string; time: string } {
  const parts = Object.fromEntries(PARTS.formatToParts(ms).map((p) => [p.type, p.value]))
  const hour = parts.hour === '24' ? '00' : parts.hour
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  }
}

/** "2026-09-12" minus one day, without a timezone getting a say. */
function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * "danas u 09:30", "jučer u 21:05", "5. rujna u 21:00".
 *
 * Today and yesterday get a word rather than a date, because those are the two
 * a reader dates by feel; anything older is named, because "prije 6 dana" is
 * arithmetic the reader then has to do backwards.
 *
 * Empty string for a timestamp that cannot be read: a row with a broken date is
 * still worth showing, just without a lie about when it arrived.
 */
export function notificationTimeLabel(iso: string, nowMs: number = Date.now()): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''

  const then = zagrebParts(ms)
  const today = zagrebParts(nowMs).date

  if (then.date === today) return `${APP_STRINGS.notifications.today} u ${then.time}`
  if (then.date === previousDay(today)) {
    return `${APP_STRINGS.notifications.yesterday} u ${then.time}`
  }

  const day = Number(then.date.slice(8, 10))
  const month = MONTHS_GENITIVE[Number(then.date.slice(5, 7)) - 1] ?? ''
  return `${day}. ${month} u ${then.time}`
}

/**
 * What the header bell's badge says, if anything (#496, #562).
 *
 * Two rules, and the second one is the audit's bug: the badge is the COUNT
 * ("three things happened" is the reason to open it, where a dot would look the
 * same whether one thing or twenty had happened), and there is NO badge on the
 * inbox itself, where the rows are already in front of the reader and a number
 * over the door they came through is noise.
 *
 * Above 99 the exact number stops being information.
 *
 * Pure, and handed the pathname rather than reading one, so the rule is tested
 * without a router and is stated in exactly one place.
 */
export function notificationBadge(unread: number, pathname: string): string | null {
  const path = (pathname.split('?')[0] ?? '').replace(/\/+$/, '')
  if (path === '/app/notifications' || path.startsWith('/app/notifications/')) return null
  if (unread <= 0) return null
  return unread > 99 ? APP_STRINGS.notifications.badgeOverflow : String(unread)
}
