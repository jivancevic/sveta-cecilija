import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub Payload so the test exercises only the guard's auth/permission logic —
// no DB, no config load. Same mock shape as the tickets.pdf route test.
const auth = vi.fn()
const payloadStub = { auth }

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => payloadStub),
}))
vi.mock('@payload-config', () => ({ default: {} }))

import { requirePermission, requireRole } from './route-guard'
import { isSuperadmin } from './roles'

const req = new Request('http://localhost/api/whatever')

beforeEach(() => {
  vi.clearAllMocks()
})

function signedInWith(permissions: unknown) {
  auth.mockResolvedValue({ user: { id: 1, permissions } })
}

describe('requirePermission', () => {
  it('returns 401 when there is no session', async () => {
    auth.mockResolvedValue({ user: null })
    const gate = await requirePermission(req, 'refunds')
    expect(gate.user).toBeNull()
    expect(gate.error?.status).toBe(401)
    await expect(gate.error?.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 when the signed-in user lacks the permission', async () => {
    signedInWith(['door'])
    const gate = await requirePermission(req, 'refunds')
    expect(gate.user).toBeNull()
    expect(gate.error?.status).toBe(403)
    await expect(gate.error?.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('passes payload + user through when the permission is held', async () => {
    signedInWith(['tickets', 'refunds'])
    const gate = await requirePermission(req, 'refunds')
    expect(gate.error).toBeNull()
    expect(gate.payload).toBe(payloadStub)
    expect(gate.user).toMatchObject({ id: 1 })
  })

  it('accepts an array as "any of these"', async () => {
    signedInWith(['partner'])
    const ok = await requirePermission(req, ['tickets', 'partner'])
    expect(ok.error).toBeNull()

    const denied = await requirePermission(req, ['tickets', 'refunds'])
    expect(denied.error?.status).toBe(403)
  })

  it('denies an empty array rather than treating it as a wildcard', async () => {
    signedInWith(['users', 'tickets', 'refunds', 'door', 'dev'])
    const gate = await requirePermission(req, [])
    expect(gate.error?.status).toBe(403)
  })

  it('denies when the permission set is missing or malformed', async () => {
    for (const perms of [undefined, null, 'refunds', 42, {}]) {
      signedInWith(perms)
      const gate = await requirePermission(req, 'refunds')
      expect(gate.error?.status).toBe(403)
    }
  })

  it('ignores an unknown word in the stored set', async () => {
    signedInWith(['sudo', 'refunds'])
    expect((await requirePermission(req, 'refunds')).error).toBeNull()
    expect((await requirePermission(req, 'users')).error?.status).toBe(403)
  })

  it('authenticates once per call (no double payload.auth)', async () => {
    signedInWith(['refunds'])
    await requirePermission(req, 'refunds')
    expect(auth).toHaveBeenCalledTimes(1)
  })
})

// The role guard is untouched by #394; this pins that it still behaves.
describe('requireRole (unchanged)', () => {
  it('still returns 401 / 403 / pass-through', async () => {
    auth.mockResolvedValue({ user: null })
    expect((await requireRole(req, isSuperadmin)).error?.status).toBe(401)

    auth.mockResolvedValue({ user: { id: 2, role: 'admin' } })
    expect((await requireRole(req, isSuperadmin)).error?.status).toBe(403)

    auth.mockResolvedValue({ user: { id: 3, role: 'superadmin' } })
    const gate = await requireRole(req, isSuperadmin)
    expect(gate.error).toBeNull()
    expect(gate.user).toMatchObject({ id: 3 })
  })
})
