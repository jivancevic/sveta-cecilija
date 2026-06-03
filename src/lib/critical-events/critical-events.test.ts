import { describe, it, expect, vi } from 'vitest'
import { recordCriticalEvent } from './record'
import { listRecentCriticalEvents } from './list'

describe('recordCriticalEvent', () => {
  it('inserts the kind and JSON-serialised context', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await recordCriticalEvent(
      { kind: 'enquiry_notification_failed', context: { email: 'a@b.com', status: 401 } },
      { query },
    )
    expect(query).toHaveBeenCalledOnce()
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/insert into critical_events/i)
    expect(params[0]).toBe('enquiry_notification_failed')
    expect(JSON.parse(params[1] as string)).toEqual({ email: 'a@b.com', status: 401 })
  })

  it('inserts NULL context when none is provided', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await recordCriticalEvent({ kind: 'something' }, { query })
    expect(query.mock.calls[0][1][1]).toBeNull()
  })

  it('never throws when the insert fails (best-effort)', async () => {
    const query = vi.fn().mockRejectedValue(new Error('table missing'))
    await expect(
      recordCriticalEvent({ kind: 'x' }, { query }),
    ).resolves.toBeUndefined()
  })
})

describe('listRecentCriticalEvents', () => {
  it('returns rows newest-first, normalising the shape', async () => {
    const created = new Date('2026-06-04T10:00:00Z')
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 7, kind: 'enquiry_notification_failed', context: { email: 'a@b.com' }, created_at: created }],
    })
    const rows = await listRecentCriticalEvents(query, 5)
    expect(query.mock.calls[0][1]).toEqual([5])
    expect(query.mock.calls[0][0]).toMatch(/order by created_at desc/i)
    expect(rows).toEqual([
      {
        id: 7,
        kind: 'enquiry_notification_failed',
        context: { email: 'a@b.com' },
        createdAt: '2026-06-04T10:00:00.000Z',
      },
    ])
  })

  it('defaults limit and tolerates a null context', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 1, kind: 'x', context: null, created_at: '2026-06-04T10:00:00.000Z' }],
    })
    const rows = await listRecentCriticalEvents(query)
    expect(typeof query.mock.calls[0][1][0]).toBe('number')
    expect(rows[0].context).toBeNull()
  })
})
