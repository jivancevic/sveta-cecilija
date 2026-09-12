import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * One route per permission class, exercised end-to-end through the real handler
 * with a stubbed `payload.auth` (#396). The point is not the business logic —
 * each of those modules has its own test — but the gate: 401 without a session,
 * 403 with the wrong permission set, and something OTHER than 401/403 once the
 * permission is held. A partner without a Partners link is included everywhere
 * it can reach a handler, because "authenticated but owning nothing" is the
 * failure mode that leaks another reseller's data if it is ever mis-wired.
 */

const auth = vi.fn()
const findByID = vi.fn()
const find = vi.fn()
const query = vi.fn(async () => ({ rows: [] }))
const payloadStub = { auth, findByID, find, db: { pool: { query } } }

vi.mock('payload', () => ({ getPayload: vi.fn(async () => payloadStub) }))
vi.mock('@payload-config', () => ({ default: {} }))
// Heavy leaves the gate never needs to reach.
vi.mock('@/lib/refund-order', () => ({ refundOrder: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/refund/build-refund-order-deps', () => ({ buildRefundOrderDeps: vi.fn(() => ({})) }))
vi.mock('@/lib/scan-deps', () => ({
  buildScanDeps: vi.fn(async () => ({
    atomicMarkScanned: async () => null,
    findScannedToken: async () => null,
    findTicket: async () => null,
    findOrderDetails: async () => null,
    findShowDetails: async () => null,
    countUnscannedActiveTickets: async () => 0,
  })),
}))

import { POST as refundPost } from './orders/[id]/refund/route'
import { POST as compIssuePost } from './comp/issue/route'
import { GET as compMembersGet } from './comp/members/route'
import { POST as scanPost } from './scan/[token]/route'
import { GET as partnerSalesGet } from './partner/sales/route'
import { POST as stornoPost } from './partner/cancel/route'
import { GET as reconciliationGet } from './partner/reconciliation/route'

const BUNDLES = {
  superadmin: [
    'users',
    'tickets',
    'refunds',
    'door',
    'partner',
    'season_stats',
    'moreska',
    'moreskant',
    'finance',
    'editor',
    'dev',
  ],
  admin: ['tickets', 'refunds', 'door'],
  tehnika: ['door'],
  partner: ['partner'],
  member: ['season_stats'],
} as const

function signIn(permissions: readonly string[] | null, extra: Record<string, unknown> = {}) {
  if (permissions === null) auth.mockResolvedValue({ user: null })
  else auth.mockResolvedValue({ user: { id: 1, permissions: [...permissions], ...extra } })
}

function post(url: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
function get(url: string) {
  return new NextRequest(`http://localhost${url}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  query.mockResolvedValue({ rows: [] })
  findByID.mockResolvedValue(null)
  find.mockResolvedValue({ docs: [] })
})

describe('refunds class — POST /api/orders/[id]/refund', () => {
  const params = Promise.resolve({ id: '42' })

  it('401s without a session', async () => {
    signIn(null)
    expect((await refundPost(post('/api/orders/42/refund'), { params })).status).toBe(401)
  })

  it.each([
    ['tehnika', BUNDLES.tehnika],
    ['partner', BUNDLES.partner],
    ['member', BUNDLES.member],
    ['tickets without refunds', ['tickets']],
    ['empty set', []],
  ])('403s for %s', async (_label, permissions) => {
    signIn(permissions)
    expect((await refundPost(post('/api/orders/42/refund'), { params })).status).toBe(403)
  })

  it.each([
    ['admin', BUNDLES.admin],
    ['superadmin', BUNDLES.superadmin],
  ])('lets %s through the gate', async (_label, permissions) => {
    signIn(permissions)
    const res = await refundPost(post('/api/orders/42/refund'), { params })
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})

describe('tickets class — POST /api/comp/issue and GET /api/comp/members', () => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await compIssuePost(post('/api/comp/issue'))).status).toBe(401)
    expect((await compMembersGet(get('/api/comp/members'))).status).toBe(401)
  })

  it.each([
    ['tehnika', BUNDLES.tehnika],
    ['partner', BUNDLES.partner],
    ['member', BUNDLES.member],
    ['refunds without tickets', ['refunds']],
  ])('403s for %s', async (_label, permissions) => {
    signIn(permissions)
    expect((await compIssuePost(post('/api/comp/issue'))).status).toBe(403)
    expect((await compMembersGet(get('/api/comp/members'))).status).toBe(403)
  })

  it.each([
    ['admin', BUNDLES.admin],
    ['superadmin', BUNDLES.superadmin],
  ])('lets %s through the gate', async (_label, permissions) => {
    signIn(permissions)
    // Deliberately an empty body: reaching the 400 proves the gate passed.
    const res = await compIssuePost(post('/api/comp/issue'))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
    expect((await compMembersGet(get('/api/comp/members'))).status).toBe(200)
  })
})

describe('door class — POST /api/scan/[token]', () => {
  const params = Promise.resolve({ token: 'tok' })

  it('401s without a session', async () => {
    signIn(null)
    expect((await scanPost(post('/api/scan/tok'), { params })).status).toBe(401)
  })

  it.each([
    ['partner', BUNDLES.partner],
    ['member', BUNDLES.member],
    ['empty set', []],
  ])('403s for %s', async (_label, permissions) => {
    signIn(permissions)
    expect((await scanPost(post('/api/scan/tok'), { params })).status).toBe(403)
  })

  it.each([
    ['tehnika (door only)', BUNDLES.tehnika],
    ['admin', BUNDLES.admin],
    ['a tickets-only holder', ['tickets']],
    ['superadmin', BUNDLES.superadmin],
  ])('lets %s through the gate', async (_label, permissions) => {
    signIn(permissions)
    const res = await scanPost(post('/api/scan/tok'), { params })
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})

describe('partner class — GET /api/partner/sales', () => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await partnerSalesGet(get('/api/partner/sales'))).status).toBe(401)
  })

  it.each([
    ['tehnika', BUNDLES.tehnika],
    ['member', BUNDLES.member],
    ['admin (no partner permission)', BUNDLES.admin],
  ])('403s for %s', async (_label, permissions) => {
    signIn(permissions)
    expect((await partnerSalesGet(get('/api/partner/sales'))).status).toBe(403)
  })

  it('403s a partner login with no Partners link — it owns nothing', async () => {
    signIn(BUNDLES.partner)
    const res = await partnerSalesGet(get('/api/partner/sales'))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Account not linked to a partner' })
    expect(query).not.toHaveBeenCalled()
  })

  it('403s the superadmin too: it holds `partner` but carries no link', async () => {
    signIn(BUNDLES.superadmin)
    expect((await partnerSalesGet(get('/api/partner/sales'))).status).toBe(403)
    expect(query).not.toHaveBeenCalled()
  })

  it('serves a linked partner, scoped to its own id', async () => {
    signIn(BUNDLES.partner, { partner: 7 })
    const res = await partnerSalesGet(get('/api/partner/sales'))
    expect(res.status).toBe(200)
    expect(query).toHaveBeenCalled()
    const sqlParams = (query.mock.calls[0] as unknown as unknown[])[1] as unknown[]
    expect(sqlParams).toContain(7)
  })
})

describe('composed class — POST /api/partner/cancel (tickets or partner)', () => {
  it('401s without a session', async () => {
    signIn(null)
    expect((await stornoPost(post('/api/partner/cancel', { orderId: '1' }))).status).toBe(401)
  })

  it.each([
    ['tehnika', BUNDLES.tehnika],
    ['member', BUNDLES.member],
    ['empty set', []],
  ])('403s for %s', async (_label, permissions) => {
    signIn(permissions)
    expect((await stornoPost(post('/api/partner/cancel', { orderId: '1' }))).status).toBe(403)
  })

  it('403s a partner with no link before touching the order', async () => {
    signIn(BUNDLES.partner)
    const res = await stornoPost(post('/api/partner/cancel', { orderId: '1' }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Account not linked to a partner' })
    expect(findByID).not.toHaveBeenCalled()
  })

  it.each([
    ['admin', BUNDLES.admin],
    ['superadmin', BUNDLES.superadmin],
    ['a linked partner', BUNDLES.partner],
  ])('lets %s through the gate to the order lookup', async (_label, permissions) => {
    signIn(permissions, { partner: 7 })
    const res = await stornoPost(post('/api/partner/cancel', { orderId: '1' }))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
    expect(findByID).toHaveBeenCalled()
  })
})

// The partner statement is money, so since #500 it answers to `finance` and to
// a partner reading its own — never to `tickets` on its own.
describe('finance class — GET /api/partner/reconciliation', () => {
  const url = '/api/partner/reconciliation?year=2026&month=8&format=json'

  it('401s without a session', async () => {
    signIn(null)
    expect((await reconciliationGet(get(url))).status).toBe(401)
  })

  it.each([
    ['tickets without finance', ['tickets']],
    ['tehnika', BUNDLES.tehnika],
    ['member', BUNDLES.member],
    ['editor', ['editor']],
    ['empty set', []],
  ])('403s for %s', async (_label, permissions) => {
    signIn(permissions)
    expect((await reconciliationGet(get(url))).status).toBe(403)
  })

  it.each([
    ['finance', ['finance']],
    ['the secretary, who holds both', ['tickets', 'finance']],
    ['superadmin', BUNDLES.superadmin],
  ])('lets %s through the gate', async (_label, permissions) => {
    signIn(permissions)
    const res = await reconciliationGet(get(`${url}&partnerId=7`))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('lets a partner through for its own statement', async () => {
    signIn(BUNDLES.partner, { partner: 7 })
    const res = await reconciliationGet(get(url))
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
