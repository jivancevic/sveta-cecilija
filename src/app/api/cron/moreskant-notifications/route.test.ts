import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// #435 — the cron route's own gate, the `tickets.pdf/route.test.ts` shape:
// Payload and the whole push stack are mocked so the test exercises only what
// the route itself decides — the bearer, the missing secret, and the shape of
// the summary it answers with.

const runRosterNotifications = vi.fn()
const vapidConfig = vi.fn()

vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ db: { pool: { query: vi.fn() } } })) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/push/roster-notifications', () => ({
  runRosterNotifications: (...args: unknown[]) => runRosterNotifications(...args),
}))
vi.mock('@/lib/push/push-data', () => ({
  createPushDeps: vi.fn(() => ({
    query: vi.fn(),
    loadAttendance: vi.fn(),
    loadMoreskanti: vi.fn(),
    loadUserIdsByMember: vi.fn(),
    send: vi.fn(),
    claim: vi.fn(),
    release: vi.fn(),
    finalize: vi.fn(),
  })),
  loadDuePerformances: vi.fn(async () => []),
}))
vi.mock('@/lib/push/vapid', () => ({ vapidConfig: () => vapidConfig() }))

import { POST } from './route'

const SUMMARY = {
  performances: 2,
  alarm: { due: 1, claimed: 1, sent: 1, skipped: 0, devices: 3, dead: 0 },
  reminder: { due: 0, claimed: 0, sent: 0, skipped: 0, devices: 0, dead: 0 },
  errors: 0,
}

const req = (auth?: string) =>
  new NextRequest('http://localhost/api/cron/moreskant-notifications', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-cron-secret'
  runRosterNotifications.mockResolvedValue(SUMMARY)
  vapidConfig.mockReturnValue({ publicKey: 'p', privateKey: 'k', subject: 'mailto:x@y.z' })
})

describe('POST /api/cron/moreskant-notifications', () => {
  it('401s without a bearer', async () => {
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(runRosterNotifications).not.toHaveBeenCalled()
  })

  it('401s on a wrong bearer, and on the secret without the scheme', async () => {
    expect((await POST(req('Bearer nope'))).status).toBe(401)
    expect((await POST(req('test-cron-secret'))).status).toBe(401)
    expect(runRosterNotifications).not.toHaveBeenCalled()
  })

  it('500s when CRON_SECRET is not configured, and never runs the jobs', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(req('Bearer anything'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'CRON_SECRET not configured' })
    expect(runRosterNotifications).not.toHaveBeenCalled()
  })

  it('runs the jobs on the right bearer and answers with the summary', async () => {
    const res = await POST(req('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ...SUMMARY, pushEnabled: true })
    expect(runRosterNotifications).toHaveBeenCalledTimes(1)
  })

  it('reports pushEnabled: false when the deployment has no VAPID keys', async () => {
    // Otherwise a misconfigured production is a log full of zeros that reads
    // exactly like a quiet week.
    vapidConfig.mockReturnValue(null)
    const res = await POST(req('Bearer test-cron-secret'))
    await expect(res.json()).resolves.toMatchObject({ pushEnabled: false })
  })

  it('500s with the message when a job throws, rather than hiding it', async () => {
    runRosterNotifications.mockRejectedValue(new Error('claim table unreachable'))
    const res = await POST(req('Bearer test-cron-secret'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'claim table unreachable' })
  })
})
