import { describe, expect, it, vi } from 'vitest'
import {
  isDeadEndpoint,
  sendPushToUsers,
  type PushMessage,
  type PushSubscriptionRow,
} from './send'

// #431 — the fan-out through a FAKE POSTER: what each device was asked to show,
// which rows the 404/410 cleanup deleted, and the counts that come back. No
// socket, no VAPID keys, no `web-push` import anywhere in this file.

const message: PushMessage = {
  title: 'Sokoliću, fali nas!',
  body: 'Stanje za nastup srijeda, 5. kolovoza u 21:00: 3 bilih, 7 crnih',
  url: '/app/izvedba/10',
  tag: 'alarm-10',
}

function device(id: number, userId: string): PushSubscriptionRow {
  return { id, userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a' }
}

function deps(subscriptions: PushSubscriptionRow[], post: (s: PushSubscriptionRow) => unknown) {
  const removed: (string | number)[] = []
  return {
    removed,
    loadSubscriptions: vi.fn(async () => subscriptions),
    post: vi.fn(async (s: PushSubscriptionRow, m: PushMessage) => {
      void m
      return post(s) as never
    }),
    removeSubscription: vi.fn(async (id: string | number) => {
      removed.push(id)
    }),
  }
}

describe('sendPushToUsers', () => {
  it('sends the same message to every device of every listed user', async () => {
    const d = deps([device(1, 'u1'), device(2, 'u1'), device(3, 'u2')], () => ({ ok: true }))
    const result = await sendPushToUsers(['u1', 'u2'], message, d)

    expect(d.post).toHaveBeenCalledTimes(3)
    expect(d.post.mock.calls.map((c) => c[1])).toEqual([message, message, message])
    // One dancer with a phone and a tablet is ONE recipient and TWO devices.
    expect(result).toEqual({ recipients: 2, devices: 3, delivered: 3, dead: 0, failed: 0 })
  })

  it('does nothing at all for an empty audience', async () => {
    const d = deps([device(1, 'u1')], () => ({ ok: true }))
    const result = await sendPushToUsers([], message, d)
    expect(d.loadSubscriptions).not.toHaveBeenCalled()
    expect(result.devices).toBe(0)
  })

  it('de-duplicates a user id that appears twice', async () => {
    const d = deps([device(1, 'u1')], () => ({ ok: true }))
    await sendPushToUsers(['u1', 'u1', 'u1'], message, d)
    expect(d.loadSubscriptions).toHaveBeenCalledWith(['u1'])
  })

  it.each([404, 410])('deletes the row when the push service answers %s', async (statusCode) => {
    const d = deps([device(7, 'u1')], () => ({ ok: false, statusCode }))
    const result = await sendPushToUsers(['u1'], message, d)

    expect(d.removed).toEqual([7])
    expect(result).toEqual({ recipients: 0, devices: 1, delivered: 0, dead: 1, failed: 0 })
  })

  it('keeps the row for a temporary failure', async () => {
    // A 500 from Apple is "not now", never "not ever".
    const d = deps([device(7, 'u1')], () => ({ ok: false, statusCode: 500 }))
    const result = await sendPushToUsers(['u1'], message, d)

    expect(d.removed).toEqual([])
    expect(result).toEqual({ recipients: 0, devices: 1, delivered: 0, dead: 0, failed: 1 })
  })

  it('treats a thrown WebPushError with a 410 as a dead endpoint', async () => {
    const d = deps([device(7, 'u1')], () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 })
    })
    const result = await sendPushToUsers(['u1'], message, d)

    expect(d.removed).toEqual([7])
    expect(result.dead).toBe(1)
  })

  it('one dead device never stops the rest of the fan-out', async () => {
    const d = deps([device(1, 'u1'), device(2, 'u2'), device(3, 'u3')], (s) =>
      s.id === 2 ? { ok: false, statusCode: 410 } : { ok: true },
    )
    const result = await sendPushToUsers(['u1', 'u2', 'u3'], message, d)

    expect(result).toEqual({ recipients: 2, devices: 3, delivered: 2, dead: 1, failed: 0 })
  })

  it('survives a cleanup that itself fails', async () => {
    const d = deps([device(1, 'u1')], () => ({ ok: false, statusCode: 410 }))
    d.removeSubscription = vi.fn(async () => {
      throw new Error('db down')
    })
    await expect(sendPushToUsers(['u1'], message, d)).resolves.toMatchObject({ dead: 1 })
  })
})

describe('isDeadEndpoint', () => {
  it.each([
    [{ ok: false, statusCode: 404 }, true],
    [{ ok: false, statusCode: 410 }, true],
    [{ ok: false, statusCode: 429 }, false],
    [{ ok: false, statusCode: 500 }, false],
    [{ ok: false }, false],
    [{ ok: true, statusCode: 201 }, false],
  ])('%o → %s', (result, expected) => {
    expect(isDeadEndpoint(result)).toBe(expected)
  })
})
