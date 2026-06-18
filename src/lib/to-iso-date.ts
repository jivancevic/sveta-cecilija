// Normalise a DB `timestamptz`/`date` value to a bare YYYY-MM-DD string.
//
// node-postgres parses a `timestamp with time zone` column into a JS Date (not a
// string), so a naive `String(value).slice(0,10)` yields "Mon Jun 22" — which is
// not a parseable ISO date and renders as "Invalid Date" downstream. This handles
// Date objects, ISO-ish strings, and a parseable fallback. Shows are stored at
// noon UTC (see the reschedule claim SQL + seed), so the UTC calendar day is the
// intended day regardless of server timezone.
export function toIsoDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  const s = String(value ?? '')
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}
