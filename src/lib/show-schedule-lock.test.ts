import { describe, expect, it, vi } from 'vitest'
import {
  RESCHEDULE_ACTION_LABEL,
  decideScheduleLock,
  scheduleLockMessage,
  scheduleMove,
  type ScheduleLockInput,
} from './show-schedule-lock'

// A stored public row, in the shape the local API hands a hook: the day as a
// Date at noon UTC (how the reschedule claim and the seed write it), the hour as
// free text.
const PUBLIC_ROW = {
  id: 79,
  isPublic: true,
  kind: 'redovna',
  date: new Date('2026-10-01T12:00:00.000Z'),
  time: '18:00',
  venue: 'ljetno-kino',
}

const BOOKING_ROW = { ...PUBLIC_ROW, id: 78, isPublic: false, kind: 'ostalo', venue: null }

function decide(input: Partial<ScheduleLockInput>, sold = 12) {
  const activeTickets = vi.fn(async (_id: string) => sold)
  const promise = decideScheduleLock(
    { operation: 'update', original: PUBLIC_ROW, ...input },
    { activeTickets },
  )
  return { promise, activeTickets }
}

describe('scheduleMove', () => {
  it('sees nothing in a save that carries neither half', () => {
    expect(scheduleMove(PUBLIC_ROW, { voditeljNote: 'kiša' })).toEqual([])
  })

  it('sees nothing when the same values come back', () => {
    // The admin form posts the whole document, so every save re-sends both
    // columns. Re-sending is not moving.
    expect(scheduleMove(PUBLIC_ROW, { date: '2026-10-01T12:00:00.000Z', time: '18:00' })).toEqual([])
  })

  it('compares the date as a day, across the shapes it arrives in', () => {
    // A Date through the local API, an ISO string through REST: the same day.
    expect(scheduleMove(PUBLIC_ROW, { date: new Date('2026-10-01T12:00:00.000Z') })).toEqual([])
    expect(scheduleMove(PUBLIC_ROW, { date: '2026-10-01' })).toEqual([])
    expect(scheduleMove(PUBLIC_ROW, { date: '2026-10-02T12:00:00.000Z' })).toEqual(['date'])
  })

  it('reads the day the `dayOnly` picker actually writes', () => {
    // Verified against @payloadcms/ui DatePicker.onChange, which sets
    // `12 - tzOffset` local hours on a day the editor PICKS: noon UTC, in every
    // timezone. A day the editor does NOT touch goes back as the instant it
    // arrived as, which is this row's own value and compares equal.
    expect(scheduleMove(PUBLIC_ROW, { date: '2026-10-02T12:00:00.000Z' })).toEqual(['date'])
    expect(scheduleMove(PUBLIC_ROW, { date: PUBLIC_ROW.date })).toEqual([])
  })

  it('sees the hour move on its own', () => {
    expect(scheduleMove(PUBLIC_ROW, { time: '21:00' })).toEqual(['time'])
    expect(scheduleMove(PUBLIC_ROW, { time: ' 18:00 ' })).toEqual([])
  })

  it('sees both halves when both move', () => {
    expect(scheduleMove(PUBLIC_ROW, { date: '2026-10-05', time: '21:00' })).toEqual(['date', 'time'])
  })

  it('treats a missing row as carrying neither value', () => {
    expect(scheduleMove(undefined, { time: '21:00' })).toEqual(['time'])
    expect(scheduleMove(PUBLIC_ROW, null)).toEqual([])
  })
})

describe('scheduleLockMessage', () => {
  it('names the half that moved', () => {
    expect(scheduleLockMessage(['time'])).toContain('start time')
    expect(scheduleLockMessage(['date'])).toContain('its date cannot')
    expect(scheduleLockMessage(['date', 'time'])).toContain('date and start time')
  })

  it('names the action that does tell the buyers', () => {
    // The label of the edit-menu item on the same screen — one constant the
    // button itself renders, so the two cannot drift apart.
    expect(scheduleLockMessage(['time'])).toContain(RESCHEDULE_ACTION_LABEL)
  })
})

describe('decideScheduleLock', () => {
  it('refuses the hour of a sold public evening', async () => {
    const { promise, activeTickets } = decide({ patch: { time: '21:00' } })
    const decision = await promise
    expect(decision.refuse).toBe(true)
    expect(decision.moved).toEqual(['time'])
    expect(activeTickets).toHaveBeenCalledWith('79')
    if (decision.refuse) expect(decision.message).toContain('start time')
  })

  it('refuses the date of a sold public evening', async () => {
    const decision = await decide({ patch: { date: '2026-10-08' } }).promise
    expect(decision.refuse).toBe(true)
  })

  it('allows the same move on an evening that has sold nothing', async () => {
    // A typo in the hour of an evening nobody has bought into is an edit, which
    // is the whole reason this is a decision and not a `readOnly` field.
    const decision = await decide({ patch: { time: '21:00' } }, 0).promise
    expect(decision.refuse).toBe(false)
  })

  it('leaves a non-public booking alone, and asks no question about it', async () => {
    const activeTickets = vi.fn(async (_id: string) => 12)
    const decision = await decideScheduleLock(
      { operation: 'update', original: BOOKING_ROW, patch: { time: '11:30' } },
      { activeTickets },
    )
    expect(decision.refuse).toBe(false)
    expect(activeTickets).not.toHaveBeenCalled()
  })

  it('still refuses when the same save would turn the sold evening private', async () => {
    const decision = await decide({ patch: { time: '21:00', isPublic: false } }).promise
    expect(decision.refuse).toBe(true)
  })

  it('costs no query when the schedule did not move', async () => {
    const { promise, activeTickets } = decide({ patch: { onlineSold: 41 } })
    expect((await promise).refuse).toBe(false)
    expect(activeTickets).not.toHaveBeenCalled()
  })

  it('costs no query on a create', async () => {
    const { promise, activeTickets } = decide({
      operation: 'create',
      original: undefined,
      patch: { date: '2026-10-01', time: '21:00' },
    })
    expect((await promise).refuse).toBe(false)
    expect(activeTickets).not.toHaveBeenCalled()
  })

  it('refuses nothing when it cannot name the row', async () => {
    // Without an id there is no count to ask for; guessing in either direction
    // would be worse than letting Payload's own access rules stand.
    const { promise, activeTickets } = decide({
      original: { ...PUBLIC_ROW, id: undefined },
      patch: { time: '21:00' },
    })
    expect((await promise).refuse).toBe(false)
    expect(activeTickets).not.toHaveBeenCalled()
  })
})
