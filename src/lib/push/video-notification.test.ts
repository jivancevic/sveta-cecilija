import { describe, expect, it } from 'vitest'
import { APP_STRINGS, PUSH_MESSAGES } from '@/lib/app/strings'
import {
  VIDEO_TTL_SECONDS,
  buildVideoMessage,
  handleVideoNotification,
  type VideoPerformanceFacts,
} from './video-notification'
import type { PushMessage, SendPushResult } from './send'

// The one ring per evening (#692). The two orderings this file protects are the
// whole feature: the audience is resolved BEFORE the claim (so a roster nobody
// can reach does not burn the evening's single ring), and the claim is taken
// BEFORE the send (so a crash loses a send rather than ringing twice).

const S = APP_STRINGS.video.ring

const REQUEST = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const PERFORMANCE: VideoPerformanceFacts = {
  id: '7',
  date: '2026-09-19',
  kind: 'redovna',
  videoUrl: 'https://www.youtube.com/watch?v=aBcD1234_-x',
}

const RESULT: SendPushResult = { recipients: 3, devices: 5, delivered: 4, dead: 0, failed: 1 }

function deps(over: Partial<Parameters<typeof handleVideoNotification>[1]> = {}) {
  const calls: string[] = []
  const sent: { userIds: readonly string[]; message: PushMessage }[] = []
  const finalized: number[] = []
  const base = {
    request: REQUEST as Parameters<typeof handleVideoNotification>[1]['request'],
    loadPerformance: async () => {
      calls.push('load')
      return PERFORMANCE
    },
    loadAudience: async () => {
      calls.push('audience')
      return { userIds: ['11', '12', '13'], withoutLogin: 2 }
    },
    claim: async () => {
      calls.push('claim')
      return true
    },
    send: async (userIds: readonly string[], message: PushMessage) => {
      calls.push('send')
      sent.push({ userIds, message })
      return RESULT
    },
    finalize: async (devices: number) => {
      calls.push('finalize')
      finalized.push(devices)
    },
  }
  return { deps: { ...base, ...over }, calls, sent, finalized }
}

describe('buildVideoMessage', () => {
  it('carries the kind, the collapsing tag, Stanje and a week of TTL', () => {
    expect(buildVideoMessage(PERFORMANCE)).toEqual({
      kind: 'video',
      title: PUSH_MESSAGES.video.title,
      body: PUSH_MESSAGES.video.body({ kind: 'Redovna', date: '2026-09-19' }),
      url: '/app/moreska/7',
      tag: 'video-7',
      ttlSeconds: VIDEO_TTL_SECONDS,
    })
  })

  it('never names the client: a ship group reads "Vanredna"', () => {
    for (const kind of ['dmc', 'gulliver', 'ostalo']) {
      const message = buildVideoMessage({ ...PERFORMANCE, kind })
      expect(message.body).toContain('Vanredna')
      expect(message.body).not.toContain('DMC')
      expect(message.body).not.toContain('Gulliver')
    }
  })

  it('says "Experience" for the short form', () => {
    expect(buildVideoMessage({ ...PERFORMANCE, kind: 'experience' }).body).toContain('Experience')
  })

  it('carries no time, because nobody is being asked to turn up', () => {
    expect(buildVideoMessage(PERFORMANCE).body).not.toMatch(/\d{1,2}:\d{2}/)
  })

  it('titles it without "novi", which a re-edit would make a lie', () => {
    expect(buildVideoMessage(PERFORMANCE).title).not.toMatch(/nov/i)
  })
})

describe('handleVideoNotification — the happy path', () => {
  it('claims, sends to the whole audience, then records the devices', async () => {
    const { deps: d, calls, sent, finalized } = deps()
    const result = await handleVideoNotification({ confirmed: true }, d)

    expect(result).toEqual({
      status: 200,
      body: { ok: true, people: 3, devices: 5, delivered: 4, withoutLogin: 2 },
    })
    expect(calls).toEqual(['load', 'audience', 'claim', 'send', 'finalize'])
    expect(sent[0]?.userIds).toEqual(['11', '12', '13'])
    expect(sent[0]?.message.kind).toBe('video')
    expect(finalized).toEqual([5])
  })
})

describe('handleVideoNotification — the refusals', () => {
  it('refuses a send the sheet did not confirm, and claims nothing', async () => {
    const { deps: d, calls } = deps()
    const result = await handleVideoNotification({}, d)
    expect(result).toEqual({ status: 400, body: { error: S.unconfirmed } })
    expect(calls).toEqual([])
  })

  it('refuses an evening with no link saved yet', async () => {
    for (const videoUrl of [null, undefined, '', '   ']) {
      const { deps: d, calls } = deps({
        loadPerformance: async () => ({ ...PERFORMANCE, videoUrl }),
      })
      const result = await handleVideoNotification({ confirmed: true }, d)
      expect(result).toEqual({ status: 400, body: { error: S.noLink } })
      expect(calls).not.toContain('claim')
    }
  })

  it('refuses an evening that does not exist', async () => {
    const { deps: d, calls } = deps({ loadPerformance: async () => null })
    const result = await handleVideoNotification({ confirmed: true }, d)
    expect(result.status).toBe(400)
    expect(calls).not.toContain('claim')
  })

  it('leaves the claim UNTAKEN when nobody on the roster can be reached', async () => {
    // The ordering that matters: burning the evening's one ring on a 409 would
    // mean the video could never be announced at all.
    const built = deps()
    const d = {
      ...built.deps,
      loadAudience: async () => {
        built.calls.push('audience')
        return { userIds: [] as string[], withoutLogin: 9 }
      },
    }
    const result = await handleVideoNotification({ confirmed: true }, d)
    expect(result).toEqual({ status: 409, body: { error: S.nobody } })
    expect(built.calls).toEqual(['load', 'audience'])
  })

  it('refuses a second send and does not push again', async () => {
    const { deps: d, calls, sent } = deps({ claim: async () => false })
    const result = await handleVideoNotification({ confirmed: true }, d)
    expect(result).toEqual({ status: 409, body: { error: S.already } })
    expect(sent).toEqual([])
    expect(calls).not.toContain('send')
  })

  it('refuses a cross-site request before anything else', async () => {
    const { deps: d, calls } = deps({
      request: {
        ...REQUEST,
        secFetchSite: 'cross-site',
      } as Parameters<typeof handleVideoNotification>[1]['request'],
    })
    const result = await handleVideoNotification({ confirmed: true }, d)
    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(calls).toEqual([])
  })
})

describe('handleVideoNotification — what survives a failure', () => {
  it('still answers 200 when the push half collapses entirely', async () => {
    // The inbox rows are filed inside `send` before a single endpoint is posted
    // to, so the roster HAS been told. A 500 here would have a voditelj press it
    // again on top of rows that already landed — and the claim would refuse.
    const { deps: d, calls } = deps({
      send: async () => {
        throw new Error('no vapid keys')
      },
    })
    const result = await handleVideoNotification({ confirmed: true }, d)
    expect(result).toEqual({
      status: 200,
      body: { ok: true, people: 3, devices: 0, delivered: 0, withoutLogin: 2 },
    })
    // The claim is KEPT: the rows are out there.
    expect(calls).toContain('claim')
  })

  it('does not let a failed finalize fail the send it only describes', async () => {
    const { deps: d } = deps({
      finalize: async () => {
        throw new Error('db blip')
      },
    })
    const result = await handleVideoNotification({ confirmed: true }, d)
    expect(result.status).toBe(200)
  })
})
