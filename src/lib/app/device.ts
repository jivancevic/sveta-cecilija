// Who actually HAS Cecilija, as a server fact (#652, ADR-0028).
//
// `platform.ts` has always known whether the browser it is running in is an
// installed app — `display-mode: standalone`, or iOS's `navigator.standalone`
// — and has always thrown that away after deciding which install banner to
// show. Nothing on the server knows. The one device trace that exists,
// `push_subscriptions`, answers a different question ("does this device ring")
// and only for the devices whose owner said yes to it.
//
// So a browser that opens the app reports itself, once, and `app_devices`
// (db/schema/migrate-zz-dl-app-devices.sql) remembers it. This file is the
// rules half: the cookie that names a browser, the throttle that keeps a normal
// day to one write, and the three answers the roster reads. All pure, all table
// tested (`device.test.ts`), in the `token-login.ts` shape — the SQL is
// `device-store.ts` and the wiring is `session-renewal-data.ts`, the
// `(shell)` layout and `POST /api/app/session/renew`.
//
// Two decisions are worth stating up front, because both are easy to get wrong
// in a way that only shows up months later on somebody's phone:
//
//  1. **The cookie is written by the SERVER and is `HttpOnly`**, exactly like
//     `cecilija_onboarded` (`onboarding.ts`) and for exactly the same reason:
//     Safari's ITP caps a script-written cookie at seven days, so a
//     browser-written "one year" quietly becomes next week and every phone
//     would look like a brand new device every Monday.
//  2. **A device is a random id, not a fingerprint and not an account.** A
//     user-agent fingerprint folds two iPhones into one row; one row per user
//     loses the phone's trace the morning its owner opens the app on a laptop.
//     A random id per browser is the only thing that survives both.

import { cookieValue, toMillis } from './http'

/**
 * The cookie that names one browser.
 *
 * `Path=/` rather than `/app`, which is the one place this differs from
 * `cecilija_onboarded`: the heartbeat handler lives at
 * `/api/app/session/renew`, and `/api/app/…` is not under `/app`, so a
 * narrower path would never reach the one route that reads it. The value is an
 * opaque random id that means nothing outside this table.
 */
export const DEVICE_COOKIE = 'cecilija_device'

/** A year, like the onboarding cookie: a device should keep one name per season. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 31_536_000

/**
 * How often one device is written down.
 *
 * Six hours, decided off `last_seen_at`, so a dancer who opens the app forty
 * times on the evening of a nastup causes one write and not forty. The signal
 * being built here is "does this person have the app", which does not get
 * better for being sampled every five minutes.
 */
export const DEVICE_HEARTBEAT_MS = 6 * 60 * 60 * 1000

/** A minted id: 36 characters of UUID, never anything read off the browser. */
export function newDeviceId(): string {
  return crypto.randomUUID()
}

/**
 * Is this a device id we minted?
 *
 * The id arrives from a cookie, which a person can edit, and it reaches
 * Postgres as a text key. Nothing is granted on the strength of it — the
 * account comes from the session, never from here — but a bounded, charset
 * checked value keeps a hostile cookie from becoming an unbounded row.
 */
export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
}

/** The device id out of a raw `Cookie:` header, or null. */
export function deviceIdFromCookieHeader(header: string | null | undefined): string | null {
  const value = cookieValue(header, DEVICE_COOKIE)
  return isDeviceId(value) ? value : null
}

/**
 * The `Set-Cookie` value the heartbeat route answers with.
 *
 * `HttpOnly` because nothing in the browser reads it and because that is what
 * puts it out of reach of ITP's seven-day cap; `Secure` follows the scheme the
 * request actually arrived on, so `http://localhost:3000` in development still
 * gets a cookie the browser keeps.
 */
export function deviceCookie(deviceId: string, options: { secure: boolean }): string {
  const parts = [
    `${DEVICE_COOKIE}=${deviceId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * Should this device be written down again?
 *
 * Four rows, each of them a row in the table test:
 *
 *  - **never seen** (`null`, a browser with no cookie or no row yet) → true.
 *    That first write is the whole point of the feature.
 *  - **seen within six hours** → false. The normal case, and the reason a day
 *    of tapping around costs one write.
 *  - **exactly six hours** → false. "Older than six hours" is a strict
 *    comparison, so the boundary writes on the next load rather than this one,
 *    the same way `shouldRenewSession` treats its seven days.
 *  - **seen in the future** → false. A skewed clock, on the phone or on the
 *    server, must not turn into a write on every single load.
 */
export function shouldRecordDevice(
  lastSeenAt: Date | number | null | undefined,
  now: Date | number,
): boolean {
  const seen = toMillis(lastSeenAt)
  if (seen === null) return true
  const nowMs = toMillis(now)
  if (nowMs === null) return false
  const age = nowMs - seen
  if (age < 0) return false
  return age > DEVICE_HEARTBEAT_MS
}

/**
 * Should this browser be ASKED whether it is an installed app, even though the
 * six-hour throttle has not run out? (#669)
 *
 * Josip: "Ana P. je skinula tako app, a meni pod clanovi pise da nije." Her row
 * was honest — she is in Samsung Internet and her install was blocked — but the
 * throttle made it impossible to tell that case from the other one, which is a
 * dancer who installs the app at rehearsal, opens it, and keeps reading as
 * "nema app" for the rest of the afternoon. That is the exact moment a voditelj
 * is looking at the screen to check whether the instruction landed.
 *
 * So: a row that has NEVER reported itself installed is worth one question per
 * page load. The question is free — the browser answers a media query and the
 * page only posts when the answer is yes, so a reader who really is in a tab
 * costs nothing at all — and the answer can only ever turn the mark ON, because
 * `standalone` ORs and never resets (`device-store.ts`).
 *
 * A row that already says installed is not asked again: there is nothing left
 * to learn, and the throttle is right for everything else.
 */
export function shouldConfirmStandalone(
  device: { standalone: boolean } | null | undefined,
): boolean {
  if (!device) return false
  return device.standalone !== true
}

/**
 * Is this report worth writing down out of turn?
 *
 * Only an installed browser saying so for the first time. A `false` arriving
 * inside the throttle says nothing new — the column ORs, so writing it would
 * change no value — and letting it through would turn every page load on every
 * plain tab into a write.
 */
export function recordsOutOfTurn(
  reported: { standalone: boolean },
  onRecord: { standalone: boolean } | null | undefined,
): boolean {
  return reported.standalone === true && shouldConfirmStandalone(onRecord)
}

/**
 * What the roster knows about one person's devices.
 *
 * Counts rather than rows: the two questions #653 asks are both "is there at
 * least one", and a count is what the grouped query in `device-store.ts`
 * returns.
 */
export interface DeviceSignal {
  /** Rows in `app_devices` for this account. Zero means nobody has reported. */
  devices: number
  /** Of those, how many have ever reported themselves installed. */
  standaloneDevices: number
  /** Live rows in `push_subscriptions` for this account. */
  pushDevices: number
}

/** An account no device has reported for, which is where every account starts. */
export const NO_DEVICE_SIGNAL: DeviceSignal = {
  devices: 0,
  standaloneDevices: 0,
  pushDevices: 0,
}

/** `unknown` is a first-class answer, not a missing one. */
export type DeviceAnswer = 'yes' | 'no' | 'unknown'

/**
 * Has this person installed the app?
 *
 * **`unknown` is the honest answer on day one** and for a long while after it:
 * the table starts empty, so every account reads `unknown` until each of their
 * browsers next opens the app. It must NOT be guessed at — an iPhone user agent
 * with a push row is not an install, and a guess written into a database is the
 * worst kind, because nothing downstream can tell it from a measurement.
 *
 * Once ANY device of theirs has reported, the answer is a real yes or no.
 */
export function installedAnswer(signal: DeviceSignal): DeviceAnswer {
  if (signal.devices <= 0) return 'unknown'
  return signal.standaloneDevices > 0 ? 'yes' : 'no'
}

/**
 * Does this person's phone ring?
 *
 * Never `unknown`, and the return type says so. `push_subscriptions` has been
 * true since the day it shipped and it SELF-HEALS: a 404 or 410 on send deletes
 * the row (`src/lib/push/send.ts`), so a live row is a live device. Faking this
 * into `unknown` to match the install column would throw away the one signal
 * that was already correct.
 */
export function notificationsAnswer(signal: DeviceSignal): 'yes' | 'no' {
  return signal.pushDevices > 0 ? 'yes' : 'no'
}
