import { describe, expect, it } from 'vitest'
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_HEARTBEAT_MS,
  deviceCookie,
  deviceIdFromCookieHeader,
  installedAnswer,
  isDeviceId,
  newDeviceId,
  notificationsAnswer,
  recordsOutOfTurn,
  shouldConfirmStandalone,
  shouldRecordDevice,
  type DeviceSignal,
} from './device'

// The rules of #652, with no database anywhere near them (the house style,
// `token-login.test.ts`). Everything interesting about the device signal is a
// boundary or a missing value, and both are cheaper as a table than as a phone.

describe('the device cookie', () => {
  it('is HttpOnly, so ITP cannot cap it at seven days', () => {
    // The whole reason the SERVER writes it: a `document.cookie` write lives
    // seven days under Safari's ITP, and this cookie has to outlive that by a
    // wide margin or every phone looks new every Monday.
    const cookie = deviceCookie('abcd1234', { secure: true })
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain(`Max-Age=${DEVICE_COOKIE_MAX_AGE_SECONDS}`)
    expect(DEVICE_COOKIE_MAX_AGE_SECONDS).toBeGreaterThan(7 * 24 * 60 * 60)
  })

  it('is scoped to the whole site, because the route is not under /app', () => {
    // `/api/app/session/renew` is not under `/app`, so `Path=/app` (which is
    // right for `cecilija_onboarded`) would never reach the one reader.
    expect(deviceCookie('abcd1234', { secure: true })).toContain('Path=/')
    expect(deviceCookie('abcd1234', { secure: true })).not.toContain('Path=/app')
  })

  it('drops Secure on plain http, so localhost keeps the cookie', () => {
    expect(deviceCookie('abcd1234', { secure: false })).not.toContain('Secure')
    expect(deviceCookie('abcd1234', { secure: true })).toContain('Secure')
  })

  it('round-trips through a Cookie header', () => {
    const id = newDeviceId()
    const header = `${DEVICE_COOKIE}=${id}; payload-token=xyz`
    expect(deviceIdFromCookieHeader(header)).toBe(id)
  })

  it.each([
    ['no header', null, null],
    ['another cookie only', 'payload-token=xyz', null],
    ['an empty value', `${DEVICE_COOKIE}=`, null],
    ['a hostile value', `${DEVICE_COOKIE}=' OR 1=1--`, null],
    ['a value that is far too long', `${DEVICE_COOKIE}=${'a'.repeat(200)}`, null],
    ['a value with spaces around it', ` ${DEVICE_COOKIE} = abcd1234 `, 'abcd1234'],
  ])('%s', (_label, header, expected) => {
    expect(deviceIdFromCookieHeader(header)).toBe(expected)
  })

  it('mints ids that pass its own check and differ from each other', () => {
    const a = newDeviceId()
    const b = newDeviceId()
    expect(isDeviceId(a)).toBe(true)
    expect(a).not.toBe(b)
  })
})

describe('the six-hour throttle', () => {
  const now = new Date('2026-09-16T20:00:00Z')

  it.each([
    ['a device that has never reported', null, true],
    ['a device seen a minute ago', new Date(now.getTime() - 60_000), false],
    ['a device seen five hours ago', new Date(now.getTime() - 5 * 3600_000), false],
    ['a device seen exactly six hours ago', new Date(now.getTime() - DEVICE_HEARTBEAT_MS), false],
    ['a device seen six hours and a second ago', new Date(now.getTime() - DEVICE_HEARTBEAT_MS - 1000), true],
    ['a device seen yesterday', new Date(now.getTime() - 24 * 3600_000), true],
    ['a skewed clock reporting the future', new Date(now.getTime() + 3600_000), false],
  ])('%s', (_label, lastSeen, expected) => {
    expect(shouldRecordDevice(lastSeen, now)).toBe(expected)
  })

  it('is six hours, so an evening of tapping around is one write', () => {
    expect(DEVICE_HEARTBEAT_MS).toBe(6 * 60 * 60 * 1000)
  })
})

describe('asking a browser again, outside the throttle (#669)', () => {
  it('asks a browser that has never said it is installed', () => {
    // The case Josip hit: a dancer installs the app at rehearsal, opens it, and
    // the six-hour throttle keeps the mark off all afternoon.
    expect(shouldConfirmStandalone({ standalone: false })).toBe(true)
  })

  it('stops asking once it has said so', () => {
    expect(shouldConfirmStandalone({ standalone: true })).toBe(false)
  })

  it('does not ask a browser with no row: the throttle already says yes', () => {
    expect(shouldConfirmStandalone(null)).toBe(false)
    expect(shouldConfirmStandalone(undefined)).toBe(false)
  })

  it('writes out of turn only for a first "yes"', () => {
    expect(recordsOutOfTurn({ standalone: true }, { standalone: false })).toBe(true)
  })

  it('refuses a "no", which the OR-ing column could not record anyway', () => {
    // Letting this through would turn every load on every plain tab into a
    // write that changes no value.
    expect(recordsOutOfTurn({ standalone: false }, { standalone: false })).toBe(false)
  })

  it('refuses a repeat "yes" from a device already on record', () => {
    expect(recordsOutOfTurn({ standalone: true }, { standalone: true })).toBe(false)
  })

  it('leaves a browser with no row to the throttle', () => {
    // `shouldRecordDevice(null)` is already true, so there is nothing to
    // override and two reasons to write would be one too many.
    expect(recordsOutOfTurn({ standalone: true }, null)).toBe(false)
  })
})

describe('the three answers', () => {
  const signal = (over: Partial<DeviceSignal> = {}): DeviceSignal => ({
    devices: 0,
    standaloneDevices: 0,
    pushDevices: 0,
    ...over,
  })

  it.each([
    ['nobody has reported yet — the honest day-one answer', signal(), 'unknown'],
    ['one browser, in a tab', signal({ devices: 1 }), 'no'],
    ['one browser, installed', signal({ devices: 1, standaloneDevices: 1 }), 'yes'],
    [
      'a laptop in a tab and a phone installed',
      signal({ devices: 2, standaloneDevices: 1 }),
      'yes',
    ],
    ['two browsers, neither installed', signal({ devices: 2 }), 'no'],
  ])('installed: %s', (_label, input, expected) => {
    expect(installedAnswer(input)).toBe(expected)
  })

  it('never guesses an install from a push row', () => {
    // The trap named in #652: an iPhone with notifications on is not evidence
    // of an install. Until a device reports, the answer stays `unknown`.
    expect(installedAnswer(signal({ pushDevices: 3 }))).toBe('unknown')
  })

  it.each([
    ['no live subscription', signal(), 'no'],
    ['one live subscription', signal({ pushDevices: 1 }), 'yes'],
    ['a phone and a tablet', signal({ pushDevices: 2 }), 'yes'],
  ])('notifications: %s', (_label, input, expected) => {
    expect(notificationsAnswer(input)).toBe(expected)
  })

  it('is never unknown, because push_subscriptions self-heals', () => {
    // A 404/410 on send deletes the row (`src/lib/push/send.ts`), so a live row
    // is a live device — true since the day it shipped, and not to be faked
    // into `unknown` to match the install column.
    const answers = [signal(), signal({ pushDevices: 1 }), signal({ devices: 4 })].map(
      notificationsAnswer,
    )
    expect(answers).not.toContain('unknown')
  })
})
