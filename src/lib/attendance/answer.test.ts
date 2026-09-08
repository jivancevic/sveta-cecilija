import { describe, expect, it, vi } from 'vitest'
import { ANSWER_ROUTE_ERRORS, handleAttendanceAnswer, type AnswerDeps } from './answer'
import { ANSWER_ERRORS } from './rules'
import type { AppRequestMeta } from '@/lib/app/request-guard'

/** A same-origin JSON POST: what the app's own fetch sends. */
const sameOrigin: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

// #422 — the answer route through injected deps: status codes, upsert
// semantics and `clear`. 401 is not modelled here on purpose: an anonymous
// caller never reaches this handler, because `requirePermission` answers first
// (its own tests cover that).

const NOW = new Date('2026-08-05T12:00:00.000Z')
const START = Date.parse('2026-08-05T19:00:00.000Z') // 21:00 Zagreb

const cici = { id: 'u9', permissions: ['moreskant'] }
const boss = { id: 'u1', permissions: ['moreska'] }

const member = {
  id: '3',
  nickname: 'Cici',
  roles: ['crni', 'bili'],
  primaryRole: 'crni',
  active: true,
  isMoreskant: true,
}

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps & {
  loadPerformance: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  return {
    request: sameOrigin,
    actor: { user: cici, memberId: '3' },
    loadPerformance: vi.fn(async () => ({ id: '10', startMs: START, cancelled: false })),
    loadMember: async () => member,
    findExisting: async () => null,
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    remove: vi.fn(async () => ({})),
    now: () => NOW,
    ...over,
  } as never
}

const body = (over: Record<string, unknown> = {}) => ({
  performanceId: '10',
  memberId: '3',
  status: 'coming',
  ...over,
})

describe('handleAttendanceAnswer — the cross-site guard', () => {
  it('403s a cross-site POST before it reads anything', async () => {
    const d = deps({
      request: { ...sameOrigin, secFetchSite: 'cross-site' },
      loadPerformance: vi.fn(async () => ({ id: '10', startMs: START, cancelled: false })),
    })
    const out = await handleAttendanceAnswer(body(), d)
    expect(out).toEqual({ status: 403, body: { error: ANSWER_ROUTE_ERRORS.rejected } })
    expect(d.loadPerformance).not.toHaveBeenCalled()
    expect(d.create).not.toHaveBeenCalled()
  })

  it('403s a foreign Origin', async () => {
    const out = await handleAttendanceAnswer(
      body(),
      deps({ request: { ...sameOrigin, origin: 'https://evil.example', secFetchSite: null } }),
    )
    expect(out).toMatchObject({ status: 403 })
  })

  it('415s anything that is not application/json', async () => {
    const out = await handleAttendanceAnswer(
      body(),
      deps({ request: { ...sameOrigin, contentType: 'application/x-www-form-urlencoded' } }),
    )
    expect(out).toEqual({ status: 415, body: { error: ANSWER_ROUTE_ERRORS.rejected } })
  })
})

describe('handleAttendanceAnswer — the body', () => {
  it.each([
    ['no performance', { performanceId: undefined }],
    ['no member', { memberId: null }],
    ['empty strings', { performanceId: '   ', memberId: '' }],
  ])('400s on %s', async (_label, over) => {
    const out = await handleAttendanceAnswer(body(over), deps())
    expect(out).toEqual({ status: 400, body: { error: ANSWER_ROUTE_ERRORS.badRequest } })
  })

  it('400s on a missing body', async () => {
    expect(await handleAttendanceAnswer(null, deps())).toMatchObject({ status: 400 })
  })

  it('400s when the performance does not exist', async () => {
    const out = await handleAttendanceAnswer(body(), deps({ loadPerformance: async () => null }))
    expect(out).toEqual({ status: 400, body: { error: ANSWER_ROUTE_ERRORS.noPerformance } })
  })

  it('accepts numeric ids', async () => {
    const d = deps()
    const out = await handleAttendanceAnswer({ performanceId: 10, memberId: 3, status: 'coming' }, d)
    expect(out.status).toBe(200)
    expect(d.create).toHaveBeenCalledWith(expect.objectContaining({ performance: '10', member: '3' }))
  })
})

describe('handleAttendanceAnswer — the rules reach the status code', () => {
  it('403s a moreškant answering for somebody else', async () => {
    const out = await handleAttendanceAnswer(
      body({ memberId: '4' }),
      deps({ loadMember: async () => ({ ...member, id: '4' }) }),
    )
    expect(out).toEqual({ status: 403, body: { error: ANSWER_ERRORS.notAllowed } })
  })

  it('403s a moreškant after the performance started', async () => {
    const out = await handleAttendanceAnswer(
      body(),
      deps({ loadPerformance: async () => ({ id: '10', startMs: NOW.getTime() - 1, cancelled: false }) }),
    )
    expect(out).toMatchObject({ status: 403, body: { error: ANSWER_ERRORS.started } })
  })

  it('403s a moreškant trying to set an army', async () => {
    const out = await handleAttendanceAnswer(body({ army: 'bili' }), deps())
    expect(out).toMatchObject({ status: 403, body: { error: ANSWER_ERRORS.armyNotAllowed } })
  })

  it('400s an army the member does not dance', async () => {
    const out = await handleAttendanceAnswer(
      body({ army: 'bili' }),
      deps({
        actor: { user: boss, memberId: null },
        loadMember: async () => ({ ...member, roles: ['crni'] }),
      }),
    )
    expect(out).toMatchObject({ status: 400, body: { error: ANSWER_ERRORS.armyNotInRoles } })
  })

  it('400s an unknown status', async () => {
    const out = await handleAttendanceAnswer(body({ status: 'mozda' }), deps())
    expect(out).toMatchObject({ status: 400, body: { error: ANSWER_ERRORS.unknownStatus } })
  })

  it('writes nothing at all when the rules refuse', async () => {
    const d = deps({ loadMember: async () => ({ ...member, id: '4' }) })
    await handleAttendanceAnswer(body({ memberId: '4' }), d)
    expect(d.create).not.toHaveBeenCalled()
    expect(d.update).not.toHaveBeenCalled()
    expect(d.remove).not.toHaveBeenCalled()
  })
})

describe('handleAttendanceAnswer — the upsert', () => {
  it('creates the row when there is none, with the default army and the author', async () => {
    const d = deps()
    const out = await handleAttendanceAnswer(body(), d)
    expect(out).toEqual({ status: 200, body: { ok: true, status: 'coming', army: 'crni' } })
    expect(d.create).toHaveBeenCalledWith({
      performance: '10',
      member: '3',
      status: 'coming',
      army: 'crni',
      answeredBy: 'u9',
      answeredAt: NOW.toISOString(),
    })
    expect(d.update).not.toHaveBeenCalled()
  })

  it('updates the existing row instead of creating a second one', async () => {
    const d = deps({ findExisting: async () => ({ id: 55, army: 'bili' }) })
    const out = await handleAttendanceAnswer(body({ status: 'not_coming' }), d)
    expect(out).toEqual({ status: 200, body: { ok: true, status: 'not_coming', army: 'bili' } })
    expect(d.update).toHaveBeenCalledWith(55, {
      status: 'not_coming',
      army: 'bili',
      answeredBy: 'u9',
      answeredAt: NOW.toISOString(),
    })
    expect(d.create).not.toHaveBeenCalled()
  })

  it('records the voditelj as the author when they answer on behalf', async () => {
    const d = deps({ actor: { user: boss, memberId: null } })
    await handleAttendanceAnswer(body(), d)
    expect(d.create).toHaveBeenCalledWith(expect.objectContaining({ answeredBy: 'u1' }))
  })

  it('moves a dual-role dancer to the other army', async () => {
    const d = deps({
      actor: { user: boss, memberId: null },
      findExisting: async () => ({ id: 55, army: 'crni' }),
    })
    const out = await handleAttendanceAnswer(body({ army: 'bili' }), d)
    expect(out).toMatchObject({ body: { army: 'bili' } })
    expect(d.update).toHaveBeenCalledWith(55, expect.objectContaining({ army: 'bili' }))
  })
})

describe('handleAttendanceAnswer — the create race', () => {
  it('re-reads and updates when the unique index rejects a racing create', async () => {
    // Two taps in flight: the other one created the row between our
    // findExisting and our create, so the index throws. Second call to
    // findExisting now sees it.
    const findExisting = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 77, army: 'crni' })
    const d = deps({
      findExisting,
      create: vi.fn(async () => {
        throw new Error('duplicate key value violates unique constraint')
      }),
    })

    const out = await handleAttendanceAnswer(body(), d)

    expect(out).toEqual({ status: 200, body: { ok: true, status: 'coming', army: 'crni' } })
    expect(d.update).toHaveBeenCalledWith(77, {
      status: 'coming',
      army: 'crni',
      answeredBy: 'u9',
      answeredAt: NOW.toISOString(),
    })
  })

  it('rethrows when the create failed for a reason that is not a race', async () => {
    const d = deps({
      findExisting: vi.fn().mockResolvedValue(null),
      create: vi.fn(async () => {
        throw new Error('connection terminated')
      }),
    })
    await expect(handleAttendanceAnswer(body(), d)).rejects.toThrow('connection terminated')
    expect(d.update).not.toHaveBeenCalled()
  })
})

describe('handleAttendanceAnswer — clear', () => {
  it('deletes the row and answers with no answer', async () => {
    const d = deps({ findExisting: async () => ({ id: 55, army: 'crni' }) })
    const out = await handleAttendanceAnswer(body({ status: 'clear' }), d)
    expect(out).toEqual({ status: 200, body: { ok: true, status: null, army: null } })
    expect(d.remove).toHaveBeenCalledWith(55)
  })

  it('is a no-op when there was no answer to begin with', async () => {
    const d = deps()
    const out = await handleAttendanceAnswer(body({ status: 'clear' }), d)
    expect(out.status).toBe(200)
    expect(d.remove).not.toHaveBeenCalled()
  })

  it('a moreškant may not clear an answer once the performance started', async () => {
    const out = await handleAttendanceAnswer(
      body({ status: 'clear' }),
      deps({ loadPerformance: async () => ({ id: '10', startMs: NOW.getTime() - 1, cancelled: false }) }),
    )
    expect(out).toMatchObject({ status: 403 })
  })

  it('a voditelj may clear one at any time', async () => {
    const d = deps({
      actor: { user: boss, memberId: null },
      loadPerformance: async () => ({ id: '10', startMs: NOW.getTime() - 1, cancelled: true }),
      findExisting: async () => ({ id: 55, army: null }),
    })
    const out = await handleAttendanceAnswer(body({ status: 'clear' }), d)
    expect(out.status).toBe(200)
    expect(d.remove).toHaveBeenCalledWith(55)
  })
})
