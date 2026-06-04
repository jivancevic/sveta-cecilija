import type { Venue } from '../venues'

const VENUE_ADDRESS: Record<Venue, string> = {
  'ljetno-kino': 'Ljetno kino, Šetalište Frana Kršinića, 20260 Korčula, Croatia',
  'zimsko-kino': 'Centar za kulturu Korčula, Trg kralja Tomislava, 20260 Korčula, Croatia',
}

// Croatian summer = CEST (UTC+2). The show date+time stored in the DB is
// local Korčula time. Convert to UTC by subtracting 2h. We use the simple
// approach (assume CEST) because all shows are during the season — never
// during the CET-only winter months. If that ever changes, switch to a
// proper TZ library.
const KORCULA_OFFSET_MIN = 120

function toUtc(dateIso: string, time: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const ms = Date.UTC(y!, m! - 1, d!, hh!, mm!) - KORCULA_OFFSET_MIN * 60 * 1000
  return new Date(ms)
}

function formatIcsDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  const iso = d.toISOString().replace(/[-:]/g, '')
  return iso.slice(0, 15) + 'Z'
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldLine(line: string): string {
  // RFC 5545: lines > 75 octets folded with CRLF + space.
  if (line.length <= 75) return line
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    parts.push(line.slice(i, i + 73))
    i += 73
  }
  return parts.join('\r\n ')
}

export interface RenderIcsInput {
  orderId: string
  show: { date: string; time: string; venue: Venue }
  durationMinutes?: number
  locale: 'en' | 'hr'
}

const SUMMARY: Record<'en' | 'hr', string> = {
  en: 'Moreška sword dance',
  hr: 'Izvedba moreške',
}

const DESCRIPTION: Record<'en' | 'hr', string> = {
  en: 'Moreška sword dance performance by HGD Sveta Cecilija. Bring your ticket PDF; staff will scan one QR for your entire party.',
  hr: 'Moreška u izvedbi HGD Sveta Cecilija. Donesite PDF ulaznice; osoblje skenira jedan QR kod za cijelu vašu skupinu.',
}

export function renderIcs(input: RenderIcsInput): string {
  const duration = input.durationMinutes ?? 90
  const start = toUtc(input.show.date, input.show.time)
  const end = new Date(start.getTime() + duration * 60 * 1000)
  const dtStart = formatIcsDate(start)
  const dtEnd = formatIcsDate(end)
  const dtStamp = formatIcsDate(new Date())
  const uid = `moreska-order-${input.orderId}@moreska.eu`
  const summary = SUMMARY[input.locale]
  const description = DESCRIPTION[input.locale]
  const location = VENUE_ADDRESS[input.show.venue]

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HGD Sveta Cecilija//moreska.eu//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `LOCATION:${escapeIcs(location)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'ORGANIZER;CN=HGD Sveta Cecilija:mailto:info@moreska.eu',
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldLine)

  return lines.join('\r\n') + '\r\n'
}

export function googleCalendarLink(input: RenderIcsInput): string {
  const duration = input.durationMinutes ?? 90
  const start = toUtc(input.show.date, input.show.time)
  const end = new Date(start.getTime() + duration * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: SUMMARY[input.locale],
    dates: `${fmt(start)}/${fmt(end)}`,
    details: DESCRIPTION[input.locale],
    location: VENUE_ADDRESS[input.show.venue],
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
