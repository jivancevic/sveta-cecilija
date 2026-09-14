import { describe, expect, it } from 'vitest'
import { loadDoorOnlyUserIds, loadStaffUserIds } from './notification-recipients'

// The two audiences #496 added, both read off `users_permissions` the way
// `loadVoditeljUserIds` does (src/lib/push/store.ts). The permission words are
// PARAMETERS, never spelled into the SQL: the vocabulary itself stays
// `src/lib/access/permissions.ts`'s (CLAUDE.md hard rule).

function fakeQuery(rows: Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: params ?? [] })
    return { rows }
  }
  return { query, calls }
}

describe('loadStaffUserIds', () => {
  it('asks only for unshared accounts holding tickets', async () => {
    const { query, calls } = fakeQuery([{ parent_id: 4 }, { parent_id: 12 }])
    expect(await loadStaffUserIds(query)).toEqual(['4', '12'])

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toContain('users_permissions')
    // Shared logins are excluded for the same reason every roster notice
    // excludes them (#441 review): a shared account's inbox belongs to nobody.
    expect(calls[0]!.sql).toMatch(/shared IS NOT TRUE/i)
    expect(calls[0]!.params).toEqual(['tickets'])
  })

  it('is an empty list when nobody qualifies', async () => {
    const { query } = fakeQuery([])
    expect(await loadStaffUserIds(query)).toEqual([])
  })
})

describe('loadDoorOnlyUserIds', () => {
  it('asks for door holders who are in no other audience', async () => {
    const { query, calls } = fakeQuery([{ parent_id: 31 }])
    expect(await loadDoorOnlyUserIds(query)).toEqual(['31'])

    const sql = calls[0]!.sql
    expect(sql).toMatch(/NOT EXISTS/i)
    // `door` first, then the words that would already put the account in a
    // group. All of them parameters.
    expect(calls[0]!.params[0]).toBe('door')
    expect(calls[0]!.params[1]).toEqual(['tickets', 'moreska', 'moreskant'])
  })

  it('does NOT exclude a shared login', async () => {
    // The door account (`tehnika`) is shared by design (ADR-0022) and the inbox
    // is exactly what it is for: nothing rings, and everyone working the gate
    // reads the same rows.
    const { query, calls } = fakeQuery([{ parent_id: 31 }])
    await loadDoorOnlyUserIds(query)
    expect(calls[0]!.sql).not.toMatch(/shared/i)
  })

  it('is an empty list when nobody qualifies', async () => {
    const { query } = fakeQuery([])
    expect(await loadDoorOnlyUserIds(query)).toEqual([])
  })
})
