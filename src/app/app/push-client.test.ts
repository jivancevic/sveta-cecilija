import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateLegacyServiceWorker } from './push-client'

// The rebrand's one moving part on a phone (#489).
//
// Renaming the worker file is free on the server and expensive on a device that
// installed the old one: its registration points at a script that is now a 404,
// and its push dies with no error anybody sees. These tests pin the repair, and
// in particular the ORDER of it — unregistering a worker drops its push
// subscription, so a re-subscribe before the unregister would subscribe to the
// thing about to be thrown away.

const VAPID = 'BNc0Zm9vYmFy'

function fakeSubscription(endpoint: string) {
  return { unsubscribe: vi.fn().mockResolvedValue(true), toJSON: () => ({ endpoint }) }
}

/**
 * One fake browser: the registrations it holds, the calls the migration makes,
 * and the subscription a successful re-subscribe produces.
 */
function installBrowser(scripts: { url: string; subscribed: boolean }[]) {
  const calls: string[] = []
  const newSubscription = fakeSubscription('https://push.example/new')

  const registrations = scripts.map(({ url, subscribed }) => ({
    active: { scriptURL: url },
    waiting: null,
    installing: null,
    pushManager: {
      getSubscription: vi
        .fn()
        .mockResolvedValue(subscribed ? fakeSubscription('https://push.example/old') : null),
      subscribe: vi.fn(),
    },
    unregister: vi.fn(async () => {
      calls.push('unregister')
      return true
    }),
  }))

  const fresh = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn(async () => {
        calls.push('subscribe')
        return newSubscription
      }),
    },
  }

  const register = vi.fn(async (url: string) => {
    calls.push(`register:${url}`)
    return fresh
  })

  const post = vi.fn(async () => {
    calls.push('post')
    return { ok: true } as Response
  })

  // The four facts `pushSupported()` asks the browser for.
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
  vi.stubGlobal('Notification', class {})
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistrations: vi.fn().mockResolvedValue(registrations),
      register,
      get ready() {
        return Promise.resolve(fresh)
      },
    },
  })
  vi.stubGlobal('fetch', post)
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'))

  return { calls, registrations, register, post, newSubscription }
}

describe('migrateLegacyServiceWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does nothing on a device that never had the Moreškant worker', async () => {
    const browser = installBrowser([
      { url: 'https://app.example/cecilija-sw.js', subscribed: true },
    ])

    await expect(migrateLegacyServiceWorker(VAPID)).resolves.toBe('nothing-to-do')
    expect(browser.calls).toEqual([])
  })

  it('unregisters the old worker before registering the new one', async () => {
    const browser = installBrowser([
      { url: 'https://app.example/moreskant-sw.js', subscribed: false },
    ])

    await expect(migrateLegacyServiceWorker(VAPID)).resolves.toBe('migrated')
    expect(browser.register).toHaveBeenCalledWith('/cecilija-sw.js', { scope: '/app' })
    // A device that was not subscribed has nothing to carry over, so the server
    // is not told about one that was never receiving anything.
    expect(browser.calls).toEqual(['unregister', 'register:/cecilija-sw.js'])
  })

  it('re-subscribes a device that WAS subscribed, and tells the server', async () => {
    const browser = installBrowser([
      { url: 'https://app.example/moreskant-sw.js', subscribed: true },
    ])

    await expect(migrateLegacyServiceWorker(VAPID)).resolves.toBe('migrated')
    expect(browser.calls).toEqual([
      'unregister',
      'register:/cecilija-sw.js',
      'subscribe',
      'post',
    ])
    expect(browser.post).toHaveBeenCalledWith('/api/app/push/subscribe', expect.anything())
    expect(browser.newSubscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('drops a subscription the server refused, so nothing reads as "on" while silent', async () => {
    const browser = installBrowser([
      { url: 'https://app.example/moreskant-sw.js', subscribed: true },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))

    await expect(migrateLegacyServiceWorker(VAPID)).resolves.toBe('failed')
    expect(browser.newSubscription.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('still swaps the worker when there is no VAPID key to re-subscribe with', async () => {
    const browser = installBrowser([
      { url: 'https://app.example/moreskant-sw.js', subscribed: true },
    ])

    await expect(migrateLegacyServiceWorker(null)).resolves.toBe('migrated')
    expect(browser.calls).toEqual(['unregister', 'register:/cecilija-sw.js'])
  })
})
