import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_PAGE_SIZE,
  insertNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from './notifications-store'

// `app_notifications` is a RAW table (db/schema/migrate-zz-dd-app-notifications.sql),
// so this store is its only reader and writer and the SQL itself is the
// behaviour under test. The fake captures statements and parameters the way
// `src/lib/push/store.test.ts` does: what matters is that the account scope is
// in every statement and that ids never reach the SQL as text.

function fakeQuery(...results: { rows: Record<string, unknown>[]; rowCount?: number }[]) {
  const calls: { sql: string; params: unknown[] }[] = []
  let i = 0
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: params ?? [] })
    return results[i++] ?? { rows: [] }
  }
  return { query, calls }
}

const MESSAGE = {
  kind: 'alarm' as const,
  title: 'Sokoliću, fali nas!',
  body: 'Stanje za nastup: 5 bilih, 3 crnih',
  url: '/app/performances/12',
}

describe('insertNotifications', () => {
  it('writes one row per account in a single statement', async () => {
    const { query, calls } = fakeQuery({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 })
    const written = await insertNotifications(query, { userIds: ['7', '9'], ...MESSAGE })

    expect(written).toBe(2)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toContain('INSERT INTO app_notifications')
    // The ids go in as an integer array, not as interpolated text.
    expect(calls[0]!.params).toEqual([
      [7, 9],
      MESSAGE.kind,
      MESSAGE.title,
      MESSAGE.body,
      MESSAGE.url,
    ])
  })

  it('does not touch the database for an empty audience', async () => {
    const { query, calls } = fakeQuery()
    expect(await insertNotifications(query, { userIds: [], ...MESSAGE })).toBe(0)
    expect(calls).toEqual([])
  })

  it('drops an id that is not a number rather than writing a NULL row', async () => {
    const { query, calls } = fakeQuery({ rows: [{ id: 1 }], rowCount: 1 })
    await insertNotifications(query, { userIds: ['7', 'nope'], ...MESSAGE })
    expect(calls[0]!.params[0]).toEqual([7])
  })

  it('writes nothing when every id was unusable', async () => {
    const { query, calls } = fakeQuery()
    expect(await insertNotifications(query, { userIds: ['nope'], ...MESSAGE })).toBe(0)
    expect(calls).toEqual([])
  })
})

describe('listNotifications', () => {
  it('reads one account, newest first, one page at a time', async () => {
    const { query, calls } = fakeQuery({
      rows: [
        {
          id: 4,
          kind: 'performance_changed',
          title: 'Promjena izvedbe',
          body: 'Promijenjeno: vrijeme.',
          url: '/app/performances/12',
          created_at: new Date('2026-09-01T10:00:00.000Z'),
          read_at: null,
        },
      ],
    })

    const rows = await listNotifications(query, '7')

    expect(rows).toEqual([
      {
        id: '4',
        kind: 'performance_changed',
        title: 'Promjena izvedbe',
        body: 'Promijenjeno: vrijeme.',
        url: '/app/performances/12',
        createdAt: '2026-09-01T10:00:00.000Z',
        readAt: null,
      },
    ])
    expect(calls[0]!.sql).toMatch(/ORDER BY created_at DESC, id DESC/i)
    expect(calls[0]!.params).toEqual([7, NOTIFICATION_PAGE_SIZE])
  })

  it('carries a read timestamp through as an ISO string', async () => {
    const { query } = fakeQuery({
      rows: [
        {
          id: 4,
          kind: 'alarm',
          title: 't',
          body: 'b',
          url: '/app',
          created_at: new Date('2026-09-01T10:00:00.000Z'),
          read_at: new Date('2026-09-02T08:30:00.000Z'),
        },
      ],
    })
    const rows = await listNotifications(query, '7')
    expect(rows[0]!.readAt).toBe('2026-09-02T08:30:00.000Z')
  })

  it('is an empty list for an unusable account id, without a query', async () => {
    const { query, calls } = fakeQuery()
    expect(await listNotifications(query, 'nope')).toEqual([])
    expect(calls).toEqual([])
  })
})

describe('unreadNotificationCount', () => {
  it('counts only the unread rows of one account', async () => {
    const { query, calls } = fakeQuery({ rows: [{ n: 3 }] })
    expect(await unreadNotificationCount(query, '7')).toBe(3)
    expect(calls[0]!.sql).toMatch(/read_at IS NULL/i)
    expect(calls[0]!.params).toEqual([7])
  })

  it('is zero when the account has nothing unread', async () => {
    const { query } = fakeQuery({ rows: [{ n: 0 }] })
    expect(await unreadNotificationCount(query, '7')).toBe(0)
  })

  it('is zero rather than NaN when the row comes back empty', async () => {
    const { query } = fakeQuery({ rows: [] })
    expect(await unreadNotificationCount(query, '7')).toBe(0)
  })

  it('is zero for an unusable account id, without a query', async () => {
    const { query, calls } = fakeQuery()
    expect(await unreadNotificationCount(query, '')).toBe(0)
    expect(calls).toEqual([])
  })
})

describe('markNotificationRead', () => {
  it('scopes the update to the row AND the account', async () => {
    const { query, calls } = fakeQuery({ rows: [{ id: 4 }], rowCount: 1 })
    expect(await markNotificationRead(query, '7', '4')).toBe(true)
    expect(calls[0]!.sql).toContain('UPDATE app_notifications')
    expect(calls[0]!.sql).toMatch(/WHERE id = \$1 AND user_id = \$2/i)
    expect(calls[0]!.params).toEqual([4, 7])
  })

  it('keeps the first timestamp, so re-opening a row does not move it', async () => {
    const { query, calls } = fakeQuery({ rows: [{ id: 4 }], rowCount: 1 })
    await markNotificationRead(query, '7', '4')
    expect(calls[0]!.sql).toMatch(/read_at = COALESCE\(read_at, now\(\)\)/i)
  })

  it('is false for a row that belongs to somebody else', async () => {
    const { query } = fakeQuery({ rows: [], rowCount: 0 })
    expect(await markNotificationRead(query, '7', '4')).toBe(false)
  })

  it('is false for an unusable id, without a query', async () => {
    const { query, calls } = fakeQuery()
    expect(await markNotificationRead(query, '7', 'nope')).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('markAllNotificationsRead', () => {
  it('clears only this account, and only what is still unread', async () => {
    const { query, calls } = fakeQuery({ rows: [], rowCount: 5 })
    expect(await markAllNotificationsRead(query, '7')).toBe(5)
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1 AND read_at IS NULL/i)
    expect(calls[0]!.params).toEqual([7])
  })

  it('is zero when there was nothing unread', async () => {
    const { query } = fakeQuery({ rows: [], rowCount: 0 })
    expect(await markAllNotificationsRead(query, '7')).toBe(0)
  })

  it('is zero for an unusable account id, without a query', async () => {
    const { query, calls } = fakeQuery()
    expect(await markAllNotificationsRead(query, 'nope')).toBe(0)
    expect(calls).toEqual([])
  })
})
