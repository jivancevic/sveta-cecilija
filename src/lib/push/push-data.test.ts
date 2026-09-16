import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileNotifications } from '@/lib/app/notifications-write'
import { createSender } from './push-data'
import type { PushMessage } from './send'

// The one seam #496 added to the push wiring: `createSender` is where a push
// and its inbox row become ONE write, for every sender at once.
//
// VAPID is deliberately left unconfigured here, which is also the honest
// regression this guards — the inbox row has to land on a deployment with no
// push keys and for an account with no device, because a dancer who never
// allowed notifications still has to find out what happened.

function fakeQuery() {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = async (sql: string, params?: unknown[]) => {
    const flat = sql.replace(/\s+/g, ' ').trim()
    calls.push({ sql: flat, params: params ?? [] })
    if (flat.startsWith('SELECT DISTINCT')) return { rows: [{ parent_id: 31 }] }
    return { rows: [{ id: 1 }], rowCount: 1 }
  }
  return { query, calls }
}

const inserts = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter((c) => c.sql.startsWith('INSERT INTO app_notifications'))

const lookups = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter((c) => c.sql.startsWith('SELECT DISTINCT'))

function message(kind: PushMessage['kind']): PushMessage {
  return { kind, title: 'Naslov', body: 'Tekst', url: '/app/performances/12', tag: `${kind}-12` }
}

beforeEach(() => {
  vi.stubEnv('VAPID_PUBLIC_KEY', '')
  vi.stubEnv('VAPID_PRIVATE_KEY', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('createSender', () => {
  it('files a row for every account it was asked to push', async () => {
    const { query, calls } = fakeQuery()
    await createSender(query)(['7', '9'], message('alarm'))

    const written = inserts(calls)
    expect(written).toHaveLength(1)
    expect(written[0]!.params).toEqual([[7, 9], 'alarm', 'Naslov', 'Tekst', '/app/performances/12'])
  })

  it('does not look up the door for a kind the door is not filed', async () => {
    const { query, calls } = fakeQuery()
    await createSender(query)(['7'], message('alarm'))
    expect(lookups(calls)).toEqual([])
  })

  it('adds the door-only accounts to a performance change, never to the push', async () => {
    const { query, calls } = fakeQuery()
    await createSender(query)(['7'], message('performance_changed'))

    expect(lookups(calls)).toHaveLength(1)
    // 31 is the door account the fake lookup returns: filed, and no device of
    // its own is ever loaded because push is unconfigured here.
    expect(inserts(calls)[0]!.params[0]).toEqual([7, 31])
  })

  it('still files rows when the audience has no devices at all', async () => {
    const { query, calls } = fakeQuery()
    const result = await createSender(query)(['7'], message('reminder'))

    expect(inserts(calls)).toHaveLength(1)
    expect(result).toEqual({ recipients: 0, devices: 0, delivered: 0, dead: 0, failed: 0 })
  })

  // The seventh kind (#654) rides the same seam as the other six, which is what
  // keeps "the push and the inbox row are one write" true for it: every active
  // moreškant gets a row whether or not their phone could be reached, and the
  // door is not part of a voditelj's sentence to the dancers.
  it('files a voditelj message for the whole roster and never for the door', async () => {
    const { query, calls } = fakeQuery()
    await createSender(query)(['7', '9'], message('message'))

    expect(lookups(calls)).toEqual([])
    expect(inserts(calls)[0]!.params[0]).toEqual([7, 9])
  })

  it('writes nothing and asks nothing for an empty audience', async () => {
    const { query, calls } = fakeQuery()
    await createSender(query)([], message('alarm'))
    expect(inserts(calls)).toEqual([])
  })
})

describe('fileNotifications', () => {
  it('swallows a failing write rather than failing the send', async () => {
    const query = async () => {
      throw new Error('relation "app_notifications" does not exist')
    }
    await expect(fileNotifications(query, message('inquiry'), ['7'])).resolves.toBe(0)
  })

  it('is a no-op for an empty audience', async () => {
    const { query, calls } = fakeQuery()
    expect(await fileNotifications(query, message('dispute'), [])).toBe(0)
    expect(calls).toEqual([])
  })
})
