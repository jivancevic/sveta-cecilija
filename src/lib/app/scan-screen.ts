// The pure half of Skener (#504) — the Cecilija screen at `/app/scan`.
//
// Everything here was inline and untested inside `/admin/scan`'s client
// component or the door dashboard. Porting the screen was the moment to lift
// it: what a decoded QR means, whether the active door show is tonight, what
// the English result card says, and how many of a party are still outside.
//
// **The result card is English on purpose** (#476): the volunteer reads it, but
// so does the guest standing in front of them. Everything around it is
// Croatian, like the rest of the app.

import type { ScanResult } from '@/lib/scan-token'

/** A token is at least 8 URL-safe characters; anything shorter is a stray code. */
const TOKEN = /^[A-Za-z0-9_-]{8,}$/

/**
 * The ticket token inside whatever the camera decoded, or null.
 *
 * A ticket QR encodes `https://moreska.eu/scan/<token>`, but a decoder hands
 * over whatever is on the paper: a full URL, a bare path, or (from a re-printed
 * slip) the token alone. Anything that is not one of those three is refused, so
 * a shop barcode in the queue can never become a POST.
 */
export function extractScanToken(decoded: string): string | null {
  if (!decoded) return null
  const trimmed = decoded.trim()
  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/^\/scan\/([^/?#]+)\/?$/)
    return match ? (match[1] ?? null) : null
  } catch {
    // Not an absolute URL; fall through to the path and bare-token forms.
  }
  const pathMatch = trimmed.match(/^\/?scan\/([^/?#]+)\/?$/)
  if (pathMatch) return pathMatch[1] ?? null
  return TOKEN.test(trimmed) ? trimmed : null
}

/**
 * Is the active door show tonight?
 *
 * A performance day is a calendar day (`shows.date` is `dayOnly`), never an
 * instant, so this compares local calendar days. It decides two things: the
 * show-day "Skeniraj" strip the shell offers a `door` holder on every other
 * screen (#472), and nothing else — the ring itself renders whatever
 * `getNextShow()` returned, with its date on it, because the canonical active
 * door show is what the door is admitting people to.
 */
export function isDoorShowToday(date: string | null | undefined, now: Date = new Date()): boolean {
  if (!date) return false
  // Zagreb, never the server's local date: the container runs UTC, so between
  // midnight and 02:00 Zagreb time the server's "today" is still yesterday and
  // the strip would appear on the night AFTER the izvedba. `en-CA` is the
  // locale whose short date is already `YYYY-MM-DD`, which is what `shows.date`
  // is. Same pattern as `src/lib/app/comp-data.ts`.
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })
  return date === today
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * "3 tickets · 2 adults, 1 child". English: the guest reads it too.
 *
 * A middle dot, not an em dash: no em dashes in anything a person reads
 * (CONTEXT.md copy rules), and the rule does not stop at the Croatian half.
 */
export function partyBreakdown(adultCount: number, childCount: number): string {
  const total = adultCount + childCount
  const parts: string[] = []
  if (adultCount > 0) parts.push(plural(adultCount, 'adult', 'adults'))
  if (childCount > 0) parts.push(plural(childCount, 'child', 'children'))
  return `${plural(total, 'ticket', 'tickets')} · ${parts.join(', ')}`
}

/** The four answers a scanned ticket can give (`scan-token.ts`, staff viewer). */
export const SCAN_RESULT_STATES = ['VALID', 'ALREADY_SCANNED', 'CANCELLED', 'INVALID'] as const
export type ScanResultState = (typeof SCAN_RESULT_STATES)[number]

export interface ResultChrome {
  /** The word across the top of the card. */
  heading: string
  /** The card's modifier, so the colour lives in `app.css` and not in JS. */
  variant: string
}

const CHROME: Record<ScanResultState, ResultChrome> = {
  VALID: { heading: 'VALID', variant: 'valid' },
  ALREADY_SCANNED: { heading: 'ALREADY SCANNED', variant: 'already-scanned' },
  CANCELLED: { heading: 'CANCELLED', variant: 'cancelled' },
  INVALID: { heading: 'INVALID', variant: 'invalid' },
}

/**
 * Heading and modifier for a result.
 *
 * `BUYER_VIEW` never reaches a staff scan (the route asks with `viewer:
 * 'staff'`), so an unknown status reads as INVALID rather than rendering a card
 * with no word on it.
 */
export function resultChrome(status: ScanResult['status'] | string): ResultChrome {
  return CHROME[status as ScanResultState] ?? CHROME.INVALID
}

/** Party members still outside once this one walks in. Never negative. */
export function remainingAfterAdmit(partySize: number, scannedCount: number): number {
  return Math.max(0, partySize - scannedCount - 1)
}
