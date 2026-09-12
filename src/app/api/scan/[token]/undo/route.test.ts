import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// The undo WINDOW is unit-tested in `src/lib/scan-token.test.ts` and enforced in
// SQL. What is exercised here is the thing only the route owns, and the reason
// Skener's Undo was broken before #504's review:
//
//   * a `fetch` caller says `Accept: application/json` and must get the status
//     as JSON — NOT a 303. `fetch` follows redirects, the redirect lands on
//     `/scan/[token]`, and a staff GET of that page re-marks the ticket
//     scanned, so an undo over the redirect silently undid itself.
//   * REJECTED must be distinguishable from UNDONE. Both are 200, so a client
//     branching on `res.ok` reported "propušteno poništeno" for a rejection.
//   * the form caller (the public scan page) keeps its 303.

const execute = vi.fn<(...a: unknown[]) => Promise<{ rows: unknown[] }>>(async () => ({ rows: [] }))
const requirePermission = vi.fn<(...a: unknown[]) => Promise<Record<string, unknown>>>(async () => ({
  payload: { db: { drizzle: { execute: (...a: unknown[]) => execute(...(a as [])) } } },
  user: { id: 9, username: 'tehnika' },
  error: null,
}))

vi.mock('@/lib/access/route-guard', () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...(args as [])),
}))

const { POST } = await import('./route')

const params = Promise.resolve({ token: 'tok_abc' })

function post(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/scan/tok_abc/undo', { method: 'POST', headers })
}

/** One row back from the UPDATE means a row was inside the window. */
function undoSucceeds() {
  execute.mockResolvedValueOnce({ rows: [{ token: 'tok_abc' }] })
}

describe('POST /api/scan/[token]/undo', () => {
  beforeEach(() => {
    execute.mockClear()
    requirePermission.mockClear()
  })

  it('is gated on door or tickets', async () => {
    await POST(post(), { params })
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), ['door', 'tickets'])
  })

  it('returns the 403 the guard built, and touches nothing', async () => {
    const forbidden = new Response('no', { status: 403 })
    requirePermission.mockResolvedValueOnce({ payload: null, user: null, error: forbidden })
    const res = await POST(post({ accept: 'application/json' }), { params })
    expect(res.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  describe('a JSON caller (Skener)', () => {
    it('gets UNDONE as a body, and NO redirect', async () => {
      undoSucceeds()
      const res = await POST(post({ accept: 'application/json' }), { params })
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
      expect(await res.json()).toEqual({ status: 'UNDONE' })
    })

    it('gets REJECTED as a body when the window has closed — also 200', async () => {
      // Both outcomes answer the request, so the status lives in the body. A
      // client branching on res.ok is exactly what reported a rejected undo as
      // a successful one.
      const res = await POST(post({ accept: 'application/json' }), { params })
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
      expect(await res.json()).toEqual({ status: 'REJECTED' })
    })

    it('is recognised on a full browser Accept header', async () => {
      undoSucceeds()
      const res = await POST(post({ accept: 'application/json, text/plain, */*' }), { params })
      expect(await res.json()).toEqual({ status: 'UNDONE' })
    })
  })

  describe('a form caller (the public /scan/[token] page)', () => {
    it('still gets a 303 back to the scan page on success', async () => {
      undoSucceeds()
      const res = await POST(post({ accept: 'text/html' }), { params })
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toContain('/scan/tok_abc')
      expect(res.headers.get('location')).not.toContain('undo=rejected')
    })

    it('still gets a 303 carrying undo=rejected when the window has closed', async () => {
      const res = await POST(post(), { params })
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toContain('undo=rejected')
    })
  })
})
