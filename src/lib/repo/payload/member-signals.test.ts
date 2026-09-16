import { describe, expect, it } from 'vitest'
import type { PoolQuery } from '@/lib/db/pool-query'
import { loadMemberAccountSignals } from './member-signals'

// The store is thin, so this is about the two things a fake pool CAN see: which
// statements go out, and what comes back out of the merge. The one rule with
// teeth is the last test: the signal has no room for an address.

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

const ACCOUNTS = 'FROM users u'

describe('loadMemberAccountSignals', () => {
  it('keys the map by MEMBER id and folds the device counts in', async () => {
    const { query } = fakeQuery({
      [ACCOUNTS]: {
        rows: [
          { user_id: 7, member_id: 42, has_address: true, has_own_password: true, sessions: 2 },
          { user_id: 8, member_id: 43, has_address: false, has_own_password: false, sessions: 0 },
        ],
      },
      'FROM app_devices': {
        rows: [{ user_id: 7, devices: 2, standalone_devices: 1 }],
      },
      'FROM push_subscriptions': { rows: [{ user_id: 8, push_devices: 1 }] },
    })

    const signals = await loadMemberAccountSignals(query)

    expect([...signals.keys()]).toEqual(['42', '43'])
    expect(signals.get('42')).toEqual({
      sessions: 2,
      device: { devices: 2, standaloneDevices: 1, pushDevices: 0 },
      hasEmail: true,
      hasOwnPassword: true,
    })
    expect(signals.get('43')).toEqual({
      sessions: 0,
      device: { devices: 0, standaloneDevices: 0, pushDevices: 1 },
      hasEmail: false,
      hasOwnPassword: false,
    })
  })

  it('counts the sessions Payload writes, from Payload’s own array table', async () => {
    const { query, calls } = fakeQuery({})
    await loadMemberAccountSignals(query)
    expect(calls[0]!.sql).toContain('users_sessions')
    // Only accounts a Member link points at: the roster is the audience.
    expect(calls[0]!.sql).toContain('u.member_id IS NOT NULL')
  })

  it('asks the device tables nothing when no account has a login', async () => {
    const { query, calls } = fakeQuery({})
    await loadMemberAccountSignals(query)
    expect(calls).toHaveLength(1)
  })

  it('answers the address as a yes-or-no and never as a value', async () => {
    const { query } = fakeQuery({
      [ACCOUNTS]: {
        rows: [{ user_id: 7, member_id: 42, has_address: true, sessions: 1 }],
      },
    })
    const signal = signalOf(await loadMemberAccountSignals(query))
    expect(Object.keys(signal).sort()).toEqual([
      'device',
      'hasEmail',
      'hasOwnPassword',
      'sessions',
    ])
    expect(JSON.stringify(signal)).not.toContain('@')
  })

  // The second half of the key (#653 review): a password the dancer CHOSE.
  // It is a stamp on the row and never the hash, because `ensureDancerLogin`
  // mints a random password for every invitation, so a hash is set for the
  // whole roster and would make this constant true.
  it('reads the chosen password off the stamp, not off the hash', async () => {
    const { query, calls } = fakeQuery({
      [ACCOUNTS]: {
        rows: [
          { user_id: 7, member_id: 42, has_address: true, has_own_password: false, sessions: 1 },
        ],
      },
    })
    const signal = signalOf(await loadMemberAccountSignals(query))
    expect(signal.hasOwnPassword).toBe(false)
    expect(calls[0]!.sql).toContain('password_set_at')
    expect(calls[0]!.sql).not.toContain('hash')
  })
})

function signalOf(map: Map<string, unknown>): Record<string, unknown> {
  return map.get('42') as Record<string, unknown>
}
