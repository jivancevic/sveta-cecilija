import { describe, expect, it, vi } from 'vitest'
import type { AppRequestMeta } from './request-guard'
import { handleMarkHandled, type MarkHandledDeps } from './inquiries-handled'
import type { InquiryState } from './inquiries-query'

const SAME_SITE: AppRequestMeta = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function deps(
  status: InquiryState | null,
  overrides: Partial<MarkHandledDeps> = {},
): MarkHandledDeps & { setHandled: ReturnType<typeof vi.fn> } {
  const setHandled = vi.fn(async () => undefined)
  return {
    request: SAME_SITE,
    loadInquiry: async () => (status === null ? null : { status }),
    setHandled,
    ...overrides,
  } as MarkHandledDeps & { setHandled: ReturnType<typeof vi.fn> }
}

describe('handleMarkHandled — the request itself', () => {
  it('refuses a cross-site call before it reads anything', async () => {
    const d = deps('new', {
      request: { ...SAME_SITE, secFetchSite: 'cross-site' },
      loadInquiry: async () => {
        throw new Error('must not be reached')
      },
    })
    const res = await handleMarkHandled('7', { handled: true }, d)
    expect(res.status).toBe(403)
    expect(d.setHandled).not.toHaveBeenCalled()
  })

  it('refuses a form post, which is what a cross-site page can send', async () => {
    const d = deps('new', { request: { ...SAME_SITE, contentType: 'text/plain' } })
    expect((await handleMarkHandled('7', { handled: true }, d)).status).toBe(415)
  })
})

describe('handleMarkHandled — the body', () => {
  it.each([
    ['no body at all', null],
    ['a body with no answer in it', {}],
    ['a string instead of a boolean', { handled: 'true' }],
    ['a number instead of a boolean', { handled: 1 }],
  ])('400s on %s', async (_label, body) => {
    const d = deps('new')
    const res = await handleMarkHandled('7', body as never, d)
    expect(res.status).toBe(400)
    expect(d.setHandled).not.toHaveBeenCalled()
  })

  it('400s on an empty id', async () => {
    expect((await handleMarkHandled('  ', { handled: true }, deps('new'))).status).toBe(400)
  })
})

describe('handleMarkHandled — the switch', () => {
  it('marks a new enquiry handled', async () => {
    const d = deps('new')
    const res = await handleMarkHandled('7', { handled: true }, d)
    expect(res).toEqual({ status: 200, body: { ok: true, status: 'handled' } })
    expect(d.setHandled).toHaveBeenCalledWith('7', true)
  })

  it('puts a handled enquiry back among the new ones (the undo)', async () => {
    const d = deps('handled')
    const res = await handleMarkHandled('7', { handled: false }, d)
    expect(res).toEqual({ status: 200, body: { ok: true, status: 'new' } })
    expect(d.setHandled).toHaveBeenCalledWith('7', false)
  })

  it('is idempotent: the same call twice leaves the same state and writes once', async () => {
    let status: InquiryState = 'new'
    const setHandled = vi.fn(async (_id: string, handled: boolean) => {
      status = handled ? 'handled' : 'new'
    })
    const d: MarkHandledDeps = {
      request: SAME_SITE,
      loadInquiry: async () => ({ status }),
      setHandled,
    }

    const first = await handleMarkHandled('7', { handled: true }, d)
    const second = await handleMarkHandled('7', { handled: true }, d)

    expect(first.body).toEqual({ ok: true, status: 'handled' })
    expect(second.body).toEqual({ ok: true, status: 'handled' })
    expect(setHandled).toHaveBeenCalledTimes(1)
    expect(status).toBe('handled')
  })

  it('404s on an enquiry that is not there', async () => {
    const d = deps(null)
    const res = await handleMarkHandled('7', { handled: true }, d)
    expect(res.status).toBe(404)
    expect(d.setHandled).not.toHaveBeenCalled()
  })
})
