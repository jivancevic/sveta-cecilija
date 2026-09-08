import { describe, expect, it } from 'vitest'
import { loadVoditeljUserIds } from './store'

// #441 review — the one thing about this query that is a RULE rather than a
// join: a shared login (ADR-0022) is never a notification recipient. The
// society's `member` account holds `moreska` and lives on whatever phone last
// signed in, so a withdrawal notice addressed to it rings a device that belongs
// to nobody in particular.

function fakeQuery(rows: Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] })
    return { rows }
  }
  return { query, calls }
}

describe('loadVoditeljUserIds', () => {
  it('asks only for unshared accounts holding moreska', async () => {
    const { query, calls } = fakeQuery([{ parent_id: 31 }, { parent_id: 8 }])
    const ids = await loadVoditeljUserIds(query)

    expect(ids).toEqual(['31', '8'])
    expect(calls).toHaveLength(1)
    const sql = calls[0]!.sql.replace(/\s+/g, ' ')
    expect(sql).toContain('users_permissions')
    // The exclusion itself, and the permission passed as a parameter rather
    // than spelled into the SQL.
    expect(sql).toMatch(/shared IS NOT TRUE/i)
    expect(calls[0]!.params).toEqual(['moreska'])
  })

  it('is an empty list when nobody qualifies', async () => {
    const { query } = fakeQuery([])
    expect(await loadVoditeljUserIds(query)).toEqual([])
  })
})
