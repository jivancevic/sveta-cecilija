import { describe, expect, it, vi } from 'vitest'
import type { AppRequestMeta } from './request-guard'
import {
  handleMarkStatementSent,
  monthHasEnded,
  type MarkSentDeps,
} from './statement-sent'

// **Označi poslanim** (#599), the action that turns a live calculation into a
// settlement. Three properties are worth a test and the rest follows from them:
// it is a switch rather than a toggle, it refuses a month that has not ended,
// and it writes nothing when the month is already where the caller asked for.

const SAME_SITE: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

/** September 2026: August has ended, September has not. */
const NOW = { year: 2026, month: 9 }

function deps(
  sentAlready: boolean,
  overrides: Partial<MarkSentDeps> = {},
): MarkSentDeps & { freeze: ReturnType<typeof vi.fn>; unfreeze: ReturnType<typeof vi.fn> } {
  const freeze = vi.fn(async () => undefined)
  const unfreeze = vi.fn(async () => undefined)
  return {
    request: SAME_SITE,
    now: NOW,
    loadPartner: async (id: string) => (id === 'nobody' ? null : { id }),
    isSent: async () => sentAlready,
    freeze,
    unfreeze,
    ...overrides,
  } as MarkSentDeps & { freeze: ReturnType<typeof vi.fn>; unfreeze: ReturnType<typeof vi.fn> }
}

const AUGUST = { partnerId: '4', year: 2026, month: 8 }

describe('the request itself', () => {
  it('refuses a cross-site call before it reads anything', async () => {
    const d = deps(false, {
      request: { ...SAME_SITE, secFetchSite: 'cross-site' },
      loadPartner: async () => {
        throw new Error('must not be reached')
      },
    })
    const res = await handleMarkStatementSent({ ...AUGUST, sent: true }, d)
    expect(res.status).toBe(403)
    expect(d.freeze).not.toHaveBeenCalled()
  })

  it('refuses a form post, which is what a cross-site page can send', async () => {
    const d = deps(false, { request: { ...SAME_SITE, contentType: 'text/plain' } })
    expect((await handleMarkStatementSent({ ...AUGUST, sent: true }, d)).status).toBe(415)
  })
})

describe('the body', () => {
  it.each([
    ['no body at all', null],
    ['a body with no answer in it', {}],
    ['a string instead of a boolean', { ...AUGUST, sent: 'true' }],
    ['no partner', { year: 2026, month: 8, sent: true }],
    ['a month out of range', { partnerId: '4', year: 2026, month: 13, sent: true }],
    ['a month that is not a number', { partnerId: '4', year: 2026, month: 'kolovoz', sent: true }],
  ])('400s on %s', async (_label, body) => {
    const d = deps(false)
    expect((await handleMarkStatementSent(body as never, d)).status).toBe(400)
    expect(d.freeze).not.toHaveBeenCalled()
  })

  it('404s on a partner that does not exist', async () => {
    const d = deps(false)
    const res = await handleMarkStatementSent({ ...AUGUST, partnerId: 'nobody', sent: true }, d)
    expect(res.status).toBe(404)
    expect(d.freeze).not.toHaveBeenCalled()
  })
})

describe('a month that has not ended', () => {
  it('cannot be marked sent, and says why', async () => {
    const d = deps(false)
    const res = await handleMarkStatementSent({ partnerId: '4', year: 2026, month: 9, sent: true }, d)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({
      error: 'Obračun se može označiti poslanim tek kad mjesec završi.',
    })
    expect(d.freeze).not.toHaveBeenCalled()
  })

  it('cannot be marked sent even from the future, which the clock decides', async () => {
    const d = deps(false)
    const res = await handleMarkStatementSent(
      { partnerId: '4', year: 2027, month: 1, sent: true },
      d,
    )
    expect(res.status).toBe(409)
  })

  it('knows where the boundary is', () => {
    expect(monthHasEnded(NOW, 2026, 8)).toBe(true)
    expect(monthHasEnded(NOW, 2026, 9)).toBe(false)
    expect(monthHasEnded(NOW, 2025, 12)).toBe(true)
    expect(monthHasEnded(NOW, 2026, 10)).toBe(false)
  })
})

describe('the switch', () => {
  it('freezes a finished month', async () => {
    const d = deps(false)
    const res = await handleMarkStatementSent({ ...AUGUST, sent: true }, d)
    expect(res).toEqual({ status: 200, body: { ok: true, sent: true } })
    expect(d.freeze).toHaveBeenCalledWith('4', 2026, 8)
  })

  it('returns a stamped month to live', async () => {
    const d = deps(true)
    const res = await handleMarkStatementSent({ ...AUGUST, sent: false }, d)
    expect(res).toEqual({ status: 200, body: { ok: true, sent: false } })
    expect(d.unfreeze).toHaveBeenCalledWith('4', 2026, 8)
  })

  // The whole reason it is a switch: a retry from a flaky connection, or a
  // second tap from another phone, must answer the same and write nothing.
  it('is idempotent in both directions', async () => {
    const already = deps(true)
    expect(await handleMarkStatementSent({ ...AUGUST, sent: true }, already)).toEqual({
      status: 200,
      body: { ok: true, sent: true },
    })
    expect(already.freeze).not.toHaveBeenCalled()

    const never = deps(false)
    expect(await handleMarkStatementSent({ ...AUGUST, sent: false }, never)).toEqual({
      status: 200,
      body: { ok: true, sent: false },
    })
    expect(never.unfreeze).not.toHaveBeenCalled()
  })

  // Un-marking is how a statement sent with a mistake gets fixed, so it must
  // work on a month that has long ended — the refusal is about FREEZING early,
  // never about touching the past.
  it('un-marks an old month without complaining about the calendar', async () => {
    const d = deps(true)
    const res = await handleMarkStatementSent(
      { partnerId: '4', year: 2024, month: 7, sent: false },
      d,
    )
    expect(res.status).toBe(200)
    expect(d.unfreeze).toHaveBeenCalledWith('4', 2024, 7)
  })
})
