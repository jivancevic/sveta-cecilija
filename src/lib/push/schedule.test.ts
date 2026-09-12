import { describe, expect, it } from 'vitest'
import {
  ALARM_LEAD_MS,
  REMINDER_LEAD_MS,
  REMINDER_WINDOW_MS,
  alarmTimeMs,
  isAlarmDue,
  isReminderDue,
  previousDay,
  reminderTimeMs,
  startsBeforeCutoff,
} from './schedule'
import { showStartMs } from '@/lib/show-time'

// #435 — the timing rules over a fake clock. Every "now" here is an explicit
// number, so none of these assertions can change meaning on a Tuesday.

const evening = { date: '2026-08-05', time: '21:00' } // CEST, +02:00
const morning = { date: '2026-08-05', time: '09:30' }

describe('startsBeforeCutoff', () => {
  it.each([
    ['09:30', true],
    ['', false],
    ['nonsense', false],
    ['13:59', true],
    ['14:00', false],
    ['14:01', false],
    ['21:00', false],
  ])('%s → %s', (time, expected) => {
    expect(startsBeforeCutoff(time)).toBe(expected)
  })
})

describe('alarmTimeMs', () => {
  it('is exactly six hours before an evening performance', () => {
    expect(alarmTimeMs(evening)).toBe(showStartMs(evening.date, evening.time) - ALARM_LEAD_MS)
  })

  it('is 18:00 the day before when the performance starts before 14:00', () => {
    // 09:30 Zagreb on 5 August; T-6h would be 03:30, which is nobody's alarm.
    expect(alarmTimeMs(morning)).toBe(Date.parse('2026-08-04T16:00:00.000Z')) // 18:00 CEST
    expect(alarmTimeMs(morning)).toBeLessThan(showStartMs(morning.date, morning.time))
  })

  it('resolves "18:00 the day before" in the zone that actually applies (DST)', () => {
    // 2026: Croatia leaves CEST at 03:00 on Sunday 25 October. A morning
    // performance on Monday 26th alarms at 18:00 CET (+01:00) on the 25th, so
    // a fixed +02:00 would ring an hour early.
    expect(alarmTimeMs({ date: '2026-10-26', time: '11:00' })).toBe(
      Date.parse('2026-10-25T17:00:00.000Z'),
    )
    // And in high summer the same wall clock is +02:00.
    expect(alarmTimeMs({ date: '2026-07-15', time: '11:00' })).toBe(
      Date.parse('2026-07-14T16:00:00.000Z'),
    )
  })

  it('is NaN for an unreadable row rather than a throw', () => {
    expect(Number.isNaN(alarmTimeMs({ date: 'nekad', time: '21:00' }))).toBe(true)
  })
})

describe('reminderTimeMs', () => {
  it('is exactly 48 hours before the start', () => {
    expect(reminderTimeMs(evening)).toBe(showStartMs(evening.date, evening.time) - REMINDER_LEAD_MS)
  })
})

describe('isAlarmDue', () => {
  const start = showStartMs(evening.date, evening.time)

  it('is not due a minute before the alarm time', () => {
    expect(isAlarmDue(evening, start - ALARM_LEAD_MS - 60_000)).toBe(false)
  })

  it('is due at the alarm time and stays due until the start', () => {
    expect(isAlarmDue(evening, start - ALARM_LEAD_MS)).toBe(true)
    expect(isAlarmDue(evening, start - 60_000)).toBe(true)
  })

  it('is over the moment the performance starts (story 20)', () => {
    expect(isAlarmDue(evening, start)).toBe(false)
    expect(isAlarmDue(evening, start + 60 * 60 * 1000)).toBe(false)
  })

  it('opens the evening before for a morning performance', () => {
    const morningStart = showStartMs(morning.date, morning.time)
    expect(isAlarmDue(morning, Date.parse('2026-08-04T15:59:00.000Z'))).toBe(false)
    expect(isAlarmDue(morning, Date.parse('2026-08-04T16:00:00.000Z'))).toBe(true)
    expect(isAlarmDue(morning, morningStart - 60_000)).toBe(true)
    expect(isAlarmDue(morning, morningStart)).toBe(false)
  })

  it('is never due for a row with no usable date', () => {
    expect(isAlarmDue({ date: 'nekad', time: '21:00' }, Date.now())).toBe(false)
  })
})

describe('isReminderDue', () => {
  const start = showStartMs(evening.date, evening.time)

  it('opens at T-48h', () => {
    expect(isReminderDue(evening, start - REMINDER_LEAD_MS - 1)).toBe(false)
    expect(isReminderDue(evening, start - REMINDER_LEAD_MS)).toBe(true)
  })

  it('closes a day later, so it never doubles up with the alarm', () => {
    const at48h = start - REMINDER_LEAD_MS
    expect(isReminderDue(evening, at48h + REMINDER_WINDOW_MS - 1)).toBe(true)
    expect(isReminderDue(evening, at48h + REMINDER_WINDOW_MS)).toBe(false)
    // The alarm time (T-6h) is well outside it.
    expect(isReminderDue(evening, start - ALARM_LEAD_MS)).toBe(false)
  })

  it('is over the moment the performance starts', () => {
    expect(isReminderDue(evening, start)).toBe(false)
  })
})

describe('previousDay', () => {
  it('steps back one calendar day across a month boundary', () => {
    expect(previousDay('2026-08-01')).toBe('2026-07-31')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
    // And across the DST switch, where a naive -24h would land on the same day.
    expect(previousDay('2026-10-26')).toBe('2026-10-25')
  })
})
