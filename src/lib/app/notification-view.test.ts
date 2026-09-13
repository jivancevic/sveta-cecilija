import { describe, expect, it } from 'vitest'
import { notificationBadge, notificationTimeLabel } from './notification-view'

// When a notification arrived, as the inbox says it (#496). Zagreb wall clock
// throughout: the rows are read in Korčula, and a row filed at 00:30 CEST must
// not read as "jučer" because UTC has not turned over yet.

const NOW = Date.parse('2026-09-12T10:00:00.000Z') // 12:00 Zagreb, CEST (+02:00)

describe('notificationTimeLabel', () => {
  it('says "danas" with the Zagreb time for something filed today', () => {
    expect(notificationTimeLabel('2026-09-12T07:30:00.000Z', NOW)).toBe('danas u 09:30')
  })

  it('says "jučer" for the calendar day before, in Zagreb', () => {
    expect(notificationTimeLabel('2026-09-11T19:05:00.000Z', NOW)).toBe('jučer u 21:05')
  })

  it('names the date once it is older than that', () => {
    expect(notificationTimeLabel('2026-09-05T19:00:00.000Z', NOW)).toBe('5. rujna u 21:00')
  })

  it('reads the Zagreb day, not the UTC one', () => {
    // 23:30 UTC on the 11th is 01:30 on the 12th in Zagreb: today, not yesterday.
    expect(notificationTimeLabel('2026-09-11T23:30:00.000Z', NOW)).toBe('danas u 01:30')
  })

  it('is empty for a timestamp it cannot read', () => {
    expect(notificationTimeLabel('not a date', NOW)).toBe('')
  })
})

// The bell's badge (#562, folded in from the audit).
describe('notificationBadge', () => {
  it('is the count, so "three things happened" is the reason to open it', () => {
    expect(notificationBadge(3, '/app/performances')).toBe('3')
  })

  it('says nothing when there is nothing to say', () => {
    expect(notificationBadge(0, '/app/performances')).toBeNull()
  })

  it('stops being a number above ninety-nine', () => {
    expect(notificationBadge(140, '/app/orders')).toBe('99+')
  })

  it('is absent on the inbox itself, where the rows are already in front of you', () => {
    expect(notificationBadge(1, '/app/notifications')).toBeNull()
    expect(notificationBadge(9, '/app/notifications/')).toBeNull()
    expect(notificationBadge(9, '/app/notifications?x=1')).toBeNull()
  })

  it('does not mistake another screen for the inbox', () => {
    expect(notificationBadge(2, '/app/notifications-archive')).toBe('2')
  })
})
