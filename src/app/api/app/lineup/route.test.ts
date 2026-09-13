import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The four-title rule, through the two routes that write a postava (#566).
 *
 * The rule itself is `checkTitles` (`lineup/titles.test.ts`) and the ORDER it
 * is applied in is `decideConfirmation` (`lineup/write-tx.test.ts`). What these
 * tests prove is the wiring, which is the half a unit test cannot see: that the
 * confirm route reads the titles from the row it locked and answers 400 with a
 * sentence naming what is missing, that it passes with all four, and above all
 * that an UNCONFIRMED replace is not asked the question at all — the MCP tool
 * and a voditelj halfway through the afternoon both write through that path.
 *
 * The store's four statements are faked at the drizzle handle, which is where
 * `lineup-store.ts` reads the locked row: the first `execute` of a lock is the
 * `SELECT ... FOR UPDATE` and the second is the grouped count.
 */

const auth = vi.fn()

/** What the fake database says the postava currently holds, by role. */
let stored: { role: string; n: number }[] = []
let confirmed = false
let missing = false

const created: Record<string, unknown>[] = []
const updated: Record<string, unknown>[] = []
let lockReads = 0

const payload = {
  auth,
  db: {
    beginTransaction: vi.fn(async () => 'tx-1'),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
    sessions: {} as Record<string, unknown>,
    drizzle: {
      execute: vi.fn(async () => {
        // Statement order inside `lockPerformance`: the locked row, then the
        // grouped count of its lineup rows.
        lockReads += 1
        if (lockReads % 2 === 1) {
          return missing
            ? { rows: [] }
            : { rows: [{ lineup_confirmed: confirmed, lineup_confirmed_at: null }] }
        }
        return { rows: stored.map((row) => ({ role: row.role, n: row.n })) }
      }),
    },
  },
  findByID: vi.fn(async () => ({ id: '10', lineupConfirmed: confirmed })),
  find: vi.fn(async () => ({
    docs: [
      { id: '1', nickname: 'Ćići', roles: ['crni', 'crni_kralj'], primaryRole: 'crni_kralj', active: true, isMoreskant: true },
      { id: '2', nickname: 'Bepo', roles: ['bili', 'bili_kralj'], primaryRole: 'bili', active: true, isMoreskant: true },
    ],
  })),
  create: vi.fn(async (args: Record<string, unknown>) => {
    created.push(args)
    return {}
  }),
  update: vi.fn(async (args: Record<string, unknown>) => {
    updated.push(args)
    return {}
  }),
  delete: vi.fn(async () => ({})),
}

vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@payload-config', () => ({ default: {} }))

import { POST as replacePost } from './route'
import { POST as confirmPost } from './confirm/route'

function request(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  })
}

const ALL_FOUR = [
  { role: 'crni_kralj', n: 1 },
  { role: 'otmanovic', n: 1 },
  { role: 'bili_kralj', n: 1 },
  { role: 'bula', n: 1 },
  { role: 'crni', n: 8 },
]

beforeEach(() => {
  auth.mockResolvedValue({ user: { id: 1, permissions: ['moreska'] } })
  stored = [...ALL_FOUR]
  confirmed = false
  missing = false
  lockReads = 0
  created.length = 0
  updated.length = 0
  vi.clearAllMocks()
})

describe('POST /api/app/lineup/confirm', () => {
  it('refuses a postava with no bili kralj, naming the title in Croatian', async () => {
    stored = ALL_FOUR.filter((row) => row.role !== 'bili_kralj')
    const res = await confirmPost(
      request('/api/app/lineup/confirm', { performanceId: '10', confirmed: true }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('Postava nema bilog kralja.')
    expect(body.error).toContain('sve četiri titule')
    // Nothing was written: the refusal is taken under the lock and rolled back.
    expect(updated).toEqual([])
    expect(payload.db.rollbackTransaction).toHaveBeenCalled()
  })

  it('refuses a postava where two dancers wear one title', async () => {
    stored = ALL_FOUR.map((row) => (row.role === 'otmanovic' ? { ...row, n: 2 } : row))
    const res = await confirmPost(
      request('/api/app/lineup/confirm', { performanceId: '10', confirmed: true }),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain(
      'Dva plesača nose titulu Otmanović.',
    )
  })

  it('confirms a postava that carries all four titles', async () => {
    const res = await confirmPost(
      request('/api/app/lineup/confirm', { performanceId: '10', confirmed: true }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, confirmed: true })
    expect(updated[0]).toMatchObject({
      collection: 'shows',
      id: '10',
      data: expect.objectContaining({ lineupConfirmed: true }),
    })
  })

  it('unlocks a postava that is missing a title, so a bad evening can be repaired', async () => {
    stored = []
    confirmed = true
    const res = await confirmPost(
      request('/api/app/lineup/confirm', { performanceId: '10', confirmed: false }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, confirmed: false })
  })

  it('still refuses to confirm an empty postava, before it asks about titles', async () => {
    stored = []
    const res = await confirmPost(
      request('/api/app/lineup/confirm', { performanceId: '10', confirmed: true }),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toContain('Prazna postava')
  })

  it('answers 403 to a dancer', async () => {
    auth.mockResolvedValue({ user: { id: 2, permissions: ['moreskant'] } })
    const res = await confirmPost(
      request('/api/app/lineup/confirm', { performanceId: '10', confirmed: true }),
    )
    expect(res.status).toBe(403)
  })
})

describe('POST /api/app/lineup', () => {
  it('writes a postava with NO titles in it at all', async () => {
    // The unconfirmed path never asks the four-title question: a voditelj is
    // halfway through by definition, and the MCP tool writes through here too.
    stored = []
    const res = await replacePost(
      request('/api/app/lineup', {
        performanceId: '10',
        entries: [
          { memberId: '1', role: 'crni' },
          { memberId: '2', role: 'bili' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    expect(created.map((c) => (c.data as { role: string }).role)).toEqual(['crni', 'bili'])
  })

  it('still refuses to replace a CONFIRMED postava, titles or no titles', async () => {
    confirmed = true
    const res = await replacePost(
      request('/api/app/lineup', {
        performanceId: '10',
        entries: [{ memberId: '1', role: 'crni_kralj' }],
      }),
    )
    expect(res.status).toBe(409)
  })
})
