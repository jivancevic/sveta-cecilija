import { describe, expect, it } from 'vitest'
import { MAX_NOTE_LENGTH, handleNoteSave, type NoteDeps } from './note'

// #436, story 25 — POST /api/app/note through its handler: the status code, the
// body and the value that reaches the collection.

const SAME_SITE = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(overrides: Partial<NoteDeps> = {}) {
  const saved: { id: string; note: string | null }[] = []
  const base: NoteDeps = {
    request: SAME_SITE,
    performanceExists: async () => true,
    saveNote: async (id, note) => {
      saved.push({ id, note })
    },
    ...overrides,
  }
  return { deps: base, saved }
}

describe('handleNoteSave', () => {
  it('saves a trimmed note and reports it back', async () => {
    const { deps: d, saved } = deps()
    const result = await handleNoteSave({ performanceId: '7', note: '  na molu u 9:30 ' }, d)

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, note: 'na molu u 9:30' })
    expect(saved).toEqual([{ id: '7', note: 'na molu u 9:30' }])
  })

  it('stores an emptied note as null, so "no note" has one shape', async () => {
    const { deps: d, saved } = deps()
    const result = await handleNoteSave({ performanceId: '7', note: '   ' }, d)
    expect(result.status).toBe(200)
    expect(saved).toEqual([{ id: '7', note: null }])
  })

  it('takes a numeric performance id, the way a JSON body may carry it', async () => {
    const { deps: d, saved } = deps()
    await handleNoteSave({ performanceId: 7, note: 'x' }, d)
    expect(saved[0]!.id).toBe('7')
  })

  it('refuses a cross-site request before it reads anything', async () => {
    const { deps: d, saved } = deps({
      request: { ...SAME_SITE, secFetchSite: 'cross-site' },
    })
    expect((await handleNoteSave({ performanceId: '7', note: 'x' }, d)).status).toBe(403)
    expect(saved).toEqual([])
  })

  it('refuses a body that is not JSON', async () => {
    const { deps: d } = deps({
      request: { ...SAME_SITE, contentType: 'text/plain' },
    })
    expect((await handleNoteSave({ performanceId: '7', note: 'x' }, d)).status).toBe(415)
  })

  it('400s without a performance', async () => {
    const { deps: d } = deps()
    expect((await handleNoteSave({ note: 'x' }, d)).status).toBe(400)
    expect((await handleNoteSave(null, d)).status).toBe(400)
  })

  it('400s for a performance that does not exist', async () => {
    const { deps: d, saved } = deps({ performanceExists: async () => false })
    const result = await handleNoteSave({ performanceId: '404', note: 'x' }, d)
    expect(result.status).toBe(400)
    expect(saved).toEqual([])
  })

  it('400s for a note longer than the field takes', async () => {
    const { deps: d } = deps()
    const result = await handleNoteSave(
      { performanceId: '7', note: 'x'.repeat(MAX_NOTE_LENGTH + 1) },
      d,
    )
    expect(result.status).toBe(400)
  })

  it('400s for a note that is not text at all', async () => {
    const { deps: d } = deps()
    expect((await handleNoteSave({ performanceId: '7', note: { evil: true } }, d)).status).toBe(400)
  })
})
