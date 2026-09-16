import { describe, expect, it, vi } from 'vitest'
import type { PoolQuery } from '@/lib/db/pool-query'
import { installedAnswer, notificationsAnswer } from './device'
import { loadDeviceSignals, loadDeviceState, recordDevice } from './device-store'

// The store is thin, so these tests are about the two things a fake pool CAN
// see: which statements go out, and what comes back out of the merge of the two
// grouped queries.

function fakeQuery(answers: Record<string, { rows: Record<string, unknown>[] }>): {
  query: PoolQuery
  calls: { sql: string; params: unknown[] }[]
} {
  const calls: { sql: string; params: unknown[] }[] = []
  const query: PoolQuery = async (sql, params = []) => {
    calls.push({ sql, params })
    for (const [needle, answer] of Object.entries(answers)) {
      if (sql.includes(needle)) return answer
    }
    return { rows: [] }
  }
  return { query, calls }
}

describe('recordDevice', () => {
  it('moves the row to the caller and never un-learns an install', async () => {
    const { query, calls } = fakeQuery({})
    await recordDevice(query, {
      deviceId: 'dev-1',
      userId: '7',
      standalone: false,
      userAgent: 'Mozilla/5.0',
    })
    const sql = calls[0]!.sql
    // The endpoint-style upsert: one row per browser, and it follows whoever is
    // signed in on it.
    expect(sql).toContain('ON CONFLICT (device_id) DO UPDATE')
    expect(sql).toContain('user_id = EXCLUDED.user_id')
    // OR, not replace: an installed Android app and a plain tab share a cookie
    // jar, so a replace would blink the mark off on every link tap.
    expect(sql).toContain('standalone = app_devices.standalone OR EXCLUDED.standalone')
    expect(calls[0]!.params).toEqual(['dev-1', 7, false, 'Mozilla/5.0'])
  })

  it('writes nothing for an account id that is not a serial', async () => {
    const query = vi.fn(async () => ({ rows: [] })) as unknown as PoolQuery
    await recordDevice(query, {
      deviceId: 'dev-1',
      userId: 'not-a-number',
      standalone: true,
      userAgent: null,
    })
    expect(query).not.toHaveBeenCalled()
  })
})

describe('loadDeviceState', () => {
  it('is null for a device with no row, which the throttle reads as "never"', async () => {
    const { query } = fakeQuery({})
    expect(await loadDeviceState(query, 'dev-unknown')).toBeNull()
  })

  it('hands back a Date, whatever pg gives it', async () => {
    const iso = '2026-09-16T10:00:00.000Z'
    const { query } = fakeQuery({
      last_seen_at: { rows: [{ last_seen_at: new Date(iso), standalone: false }] },
    })
    expect((await loadDeviceState(query, 'dev-1'))?.lastSeenAt?.toISOString()).toBe(iso)
  })

  it('reads a string timestamp too, because pg hands one back unparsed', async () => {
    const iso = '2026-09-16T10:00:00.000Z'
    const { query } = fakeQuery({
      last_seen_at: { rows: [{ last_seen_at: iso, standalone: true }] },
    })
    expect((await loadDeviceState(query, 'dev-1'))?.lastSeenAt?.toISOString()).toBe(iso)
  })

  it('reports whether this browser has ever said it is installed (#669)', async () => {
    const yes = fakeQuery({ last_seen_at: { rows: [{ last_seen_at: null, standalone: true }] } })
    expect((await loadDeviceState(yes.query, 'dev-1'))?.standalone).toBe(true)

    const no = fakeQuery({ last_seen_at: { rows: [{ last_seen_at: null, standalone: false }] } })
    expect((await loadDeviceState(no.query, 'dev-1'))?.standalone).toBe(false)

    // A NULL column reads as "has not", never as "unknown": the mark it feeds
    // has three answers and this is not where the third one comes from.
    const nul = fakeQuery({ last_seen_at: { rows: [{ last_seen_at: null, standalone: null }] } })
    expect((await loadDeviceState(nul.query, 'dev-1'))?.standalone).toBe(false)
  })
})

describe('loadDeviceSignals', () => {
  it('merges the two grouped counts without joining them', async () => {
    const { query, calls } = fakeQuery({
      'FROM app_devices': {
        rows: [
          { user_id: 7, devices: 2, standalone_devices: 1 },
          { user_id: 8, devices: 1, standalone_devices: 0 },
        ],
      },
      'FROM push_subscriptions': {
        rows: [
          { user_id: 7, push_devices: 1 },
          { user_id: 9, push_devices: 2 },
        ],
      },
    })

    const signals = await loadDeviceSignals(query, ['7', '8', '9', '10'])

    expect(calls).toHaveLength(2)
    // A dancer with a phone installed and a laptop in a tab, who also lets the
    // phone ring.
    expect(signals.get('7')).toEqual({ devices: 2, standaloneDevices: 1, pushDevices: 1 })
    expect(installedAnswer(signals.get('7')!)).toBe('yes')
    // A browser that reported and is not installed: a real "no".
    expect(installedAnswer(signals.get('8')!)).toBe('no')
    // Notifications on, no device report yet: the install stays unknown and the
    // notification answer is still true from day one.
    expect(installedAnswer(signals.get('9')!)).toBe('unknown')
    expect(notificationsAnswer(signals.get('9')!)).toBe('yes')
    // Nobody at all: absent from the map, which the caller reads as unknown.
    expect(signals.has('10')).toBe(false)
  })

  it('asks nothing when there is nobody to ask about', async () => {
    const query = vi.fn(async () => ({ rows: [] })) as unknown as PoolQuery
    expect((await loadDeviceSignals(query, [])).size).toBe(0)
    expect(query).not.toHaveBeenCalled()
  })
})
