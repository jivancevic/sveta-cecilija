import { describe, expect, it } from 'vitest'
import { countArmies, type AttendanceRow } from '@/lib/attendance/army-count'
import type { AttendanceMember } from '@/lib/attendance/rules'
import { showStartMs } from '@/lib/show-time'
import {
  MIN_ALARM_TTL_SECONDS,
  REMINDER_TTL_SECONDS,
  alarmRecipientMembers,
  alarmTtlSeconds,
  anyArmyBelowThreshold,
  buildAlarmMessage,
  buildReminderMessage,
  reminderRecipientMembers,
  toUserIds,
} from './recipients'

/** The full sentence a device shows, the way a reader would read it. */
function alarmText(perf: typeof performance, count: Parameters<typeof buildAlarmMessage>[1]) {
  const message = buildAlarmMessage(perf, count)
  return `${message.title} ${message.body}`
}

// #431 — who an alarm reaches and what it says, over the REAL army count so the
// notification text and the card chip can never disagree.

function member(id: string, nickname: string, primaryRole: string): AttendanceMember {
  return { id, nickname, roles: [primaryRole], primaryRole, active: true, isMoreskant: true }
}

const roster: AttendanceMember[] = [
  member('1', 'Cici', 'crni'),
  member('2', 'Bepo', 'crni'),
  member('3', 'Grgo', 'bili'),
  member('4', 'Duje', 'bili'),
  member('5', 'Marin', 'crni'),
  member('6', 'Ante', 'bula'),
]

const rows: AttendanceRow[] = [
  { memberId: '1', status: 'coming', army: 'crni' },
  { memberId: '2', status: 'coming', army: 'crni' },
  { memberId: '3', status: 'coming', army: 'bili' },
  { memberId: '4', status: 'not_coming', army: null },
  // 5 and 6 have not answered at all.
]

const count = countArmies(rows, roster, { crni: 2, bili: 2 })
const performance = { id: '10', date: '2026-08-05', time: '21:00' }

describe('alarmRecipientMembers', () => {
  it('is the no-answer list by default', () => {
    expect(alarmRecipientMembers(count).sort()).toEqual(['5', '6'])
  })

  it('adds the "ne dolazim" answers when the voditelj ticks the box', () => {
    expect(alarmRecipientMembers(count, { includeNotComing: true }).sort()).toEqual([
      '4',
      '5',
      '6',
    ])
  })

  it('never includes someone who is already coming', () => {
    const all = alarmRecipientMembers(count, { includeNotComing: true })
    expect(all).not.toContain('1')
    expect(all).not.toContain('3')
  })
})

describe('reminderRecipientMembers', () => {
  it('is the no-answer list and nothing else (story 14)', () => {
    expect(reminderRecipientMembers(count).sort()).toEqual(['5', '6'])
  })
})

describe('anyArmyBelowThreshold', () => {
  it('is false when both armies are at or above their threshold', () => {
    expect(anyArmyBelowThreshold(countArmies(rows, roster, { crni: 2, bili: 1 }))).toBe(false)
  })

  it('is true when either army is short', () => {
    expect(anyArmyBelowThreshold(countArmies(rows, roster, { crni: 2, bili: 2 }))).toBe(true)
    expect(anyArmyBelowThreshold(countArmies(rows, roster, { crni: 8, bili: 1 }))).toBe(true)
  })
})

describe('the alarm message', () => {
  it('states the CURRENT headcount, bili first, never the shortfall', () => {
    // 1 bili coming, 2 crni coming; thresholds are 2 and 2, and neither number
    // appears in the sentence.
    expect(alarmText(performance, count)).toBe(
      'Sokoliću, fali nas! Stanje za nastup srijeda, 5. kolovoza u 21:00: 1 bilih, 2 crnih',
    )
  })

  it('opens the performance when tapped, and collapses per performance', () => {
    const message = buildAlarmMessage(performance, count)
    expect(message.url).toBe('/app/izvedba/10')
    expect(message.tag).toBe('alarm-10')
  })

  it('expires WITH the performance, so an offline phone is never woken too late', () => {
    const start = showStartMs(performance.date, performance.time)
    const twoHoursBefore = start - 2 * 60 * 60 * 1000
    expect(buildAlarmMessage(performance, count, twoHoursBefore).ttlSeconds).toBe(2 * 60 * 60)
    // Never zero or negative, whatever the clock says.
    expect(alarmTtlSeconds(performance, start)).toBe(MIN_ALARM_TTL_SECONDS)
    expect(alarmTtlSeconds(performance, start + 60_000)).toBe(MIN_ALARM_TTL_SECONDS)
    expect(alarmTtlSeconds({ id: '1', date: 'nekad', time: '21:00' }, start)).toBe(
      MIN_ALARM_TTL_SECONDS,
    )
  })

  it('a bula moves no headcount', () => {
    // Ante (bula) answering "coming" changes neither number in the sentence.
    const withBula = countArmies(
      [...rows, { memberId: '6', status: 'coming', army: null }],
      roster,
      { crni: 2, bili: 2 },
    )
    expect(alarmText(performance, withBula)).toContain('1 bilih, 2 crnih')
  })
})

describe('the reminder message', () => {
  it('names the evening and points at it', () => {
    const message = buildReminderMessage(performance)
    expect(message.title).toBe('Javi dolazak')
    expect(message.body).toContain('srijeda, 5. kolovoza u 21:00')
    expect(message.url).toBe('/app/izvedba/10')
    expect(message.tag).toBe('reminder-10')
    // A reminder two days out survives a night in a tunnel.
    expect(message.ttlSeconds).toBe(REMINDER_TTL_SECONDS)
  })
})

describe('toUserIds', () => {
  it('drops a guest Member who has no login', () => {
    const map = new Map([
      ['5', 'u5'],
      ['7', 'u7'],
    ])
    // Member 6 is a guest: counted in the no-answer list, unreachable by push.
    expect(toUserIds(['5', '6'], map)).toEqual(['u5'])
  })

  it('de-duplicates and survives an empty map', () => {
    expect(toUserIds(['5', '5'], new Map([['5', 'u5']]))).toEqual(['u5'])
    expect(toUserIds(['5'], new Map())).toEqual([])
  })
})
