import { describe, expect, it } from 'vitest'
import { APP_STRINGS } from './strings'
import { handleVideoSave } from './video'
import { YOUTUBE_WATCH_PREFIX } from './video-link'

// Saving the Snimka's link (#692). Everything here is DI'd, so "what is
// refused", "what is stored" and "clearing is a save" are asserted without
// Payload or Postgres.

const S = APP_STRINGS.video

const REQUEST = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(over: Partial<Parameters<typeof handleVideoSave>[2]> = {}) {
  const saved: { id: string; url: string | null }[] = []
  const base = {
    request: REQUEST as Parameters<typeof handleVideoSave>[2]['request'],
    loadPerformance: async () => ({ kind: 'redovna' }),
    saveVideo: async (id: string, url: string | null) => {
      saved.push({ id, url })
    },
  }
  return { deps: { ...base, ...over }, saved }
}

describe('handleVideoSave — what gets stored', () => {
  it('stores a YouTube paste as the canonical watch URL', async () => {
    const { deps: d, saved } = deps()
    const result = await handleVideoSave('7', { url: 'https://youtu.be/aBcD1234_-x?si=tok&t=9' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, url: `${YOUTUBE_WATCH_PREFIX}aBcD1234_-x` })
    expect(saved).toEqual([{ id: '7', url: `${YOUTUBE_WATCH_PREFIX}aBcD1234_-x` }])
  })

  it('stores a non-YouTube https link exactly as pasted', async () => {
    const url = 'https://drive.google.com/file/d/1AbC/view?usp=sharing'
    const { deps: d, saved } = deps()
    const result = await handleVideoSave('7', { url }, d)
    expect(result.status).toBe(200)
    expect(saved).toEqual([{ id: '7', url }])
  })

  it('addresses the row from the path, trimmed', async () => {
    const { deps: d, saved } = deps()
    await handleVideoSave(' 7 ', { url: 'https://example.com/a' }, d)
    expect(saved[0]?.id).toBe('7')
  })

  it('clears the link, which is a legitimate save and not a refusal', async () => {
    for (const url of [undefined, null, '', '   ']) {
      const { deps: d, saved } = deps()
      const result = await handleVideoSave('7', { url }, d)
      expect(result.status).toBe(200)
      expect(result.body).toEqual({ ok: true, url: null })
      expect(saved).toEqual([{ id: '7', url: null }])
    }
  })
})

describe('handleVideoSave — the refusals, all 400 and never a 500', () => {
  it('refuses a paste that is not an https link, and writes nothing', async () => {
    for (const url of ['http://example.com/a', 'not a link', 'javascript:alert(1)']) {
      const { deps: d, saved } = deps()
      const result = await handleVideoSave('7', { url }, d)
      expect(result).toEqual({ status: 400, body: { error: S.invalid } })
      expect(saved).toEqual([])
    }
  })

  it('refuses an empty performance id in the path', async () => {
    const { deps: d, saved } = deps()
    const result = await handleVideoSave('  ', { url: 'https://example.com/a' }, d)
    expect(result).toEqual({ status: 400, body: { error: S.missing } })
    expect(saved).toEqual([])
  })

  it('refuses a performance that does not exist', async () => {
    const { deps: d, saved } = deps({ loadPerformance: async () => null })
    const result = await handleVideoSave('7', { url: 'https://example.com/a' }, d)
    expect(result).toEqual({ status: 400, body: { error: S.missing } })
    expect(saved).toEqual([])
  })

  it('refuses a koncert, which Cecilija does not show at all', async () => {
    // The screen this would be hidden on does not exist — a koncert detail is a
    // 404 (#635) — so the route is the only place the rule can live.
    const { deps: d, saved } = deps({ loadPerformance: async () => ({ kind: 'koncert' }) })
    const result = await handleVideoSave('7', { url: 'https://example.com/a' }, d)
    expect(result).toEqual({ status: 400, body: { error: S.missing } })
    expect(saved).toEqual([])
  })

  it('accepts every kind Cecilija does show', async () => {
    for (const kind of ['redovna', 'dmc', 'gulliver', 'experience', 'ostalo']) {
      const { deps: d, saved } = deps({ loadPerformance: async () => ({ kind }) })
      const result = await handleVideoSave('7', { url: 'https://example.com/a' }, d)
      expect(result.status).toBe(200)
      expect(saved).toHaveLength(1)
    }
  })

  it('refuses a cross-site request before looking at anything else', async () => {
    const { deps: d, saved } = deps({
      request: {
        ...REQUEST,
        secFetchSite: 'cross-site',
      } as Parameters<typeof handleVideoSave>[2]['request'],
    })
    const result = await handleVideoSave('7', { url: 'https://example.com/a' }, d)
    expect(result.status).toBeGreaterThanOrEqual(400)
    expect(saved).toEqual([])
  })
})
