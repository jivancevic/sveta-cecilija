import { describe, expect, it, vi } from 'vitest'
import {
  codeIsLive,
  handleJoinClaim,
  handleJoinDecide,
  handleJoinStatus,
  JOIN_CLAIM_TTL_MS,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  makeJoinCode,
  normalizeJoinCode,
  type JoinClaimDeps,
  type JoinDecideDeps,
  type JoinStatusDeps,
} from './join'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const NOW = Date.parse('2026-09-12T18:00:00.000Z')
const cici = { id: 12, name: 'Ivan Fabris', nickname: 'Cici', isMoreskant: true, active: true }

describe('normalizeJoinCode', () => {
  it.each([
    ['abc123', 'ABC123'],
    ['  Abc123  ', 'ABC123'],
    ['', ''],
    [42, ''],
    [null, ''],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeJoinCode(raw)).toBe(expected)
  })
})

describe('makeJoinCode', () => {
  it('draws six characters from the unambiguous alphabet', () => {
    const code = makeJoinCode(() => 0)
    expect(code).toBe(JOIN_CODE_ALPHABET[0]!.repeat(JOIN_CODE_LENGTH))
  })

  // A code is read off a sheet in a hall: nothing that can be confused.
  it('has no 0, O, 1, I or L to misread', () => {
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01OIL]/)
  })
})

describe('codeIsLive', () => {
  it.each([
    ['a code with time left', new Date(NOW + 1000), true],
    ['a code that just died', new Date(NOW), false],
    ['yesterday', new Date(NOW - 86_400_000), false],
    ['nonsense', 'not a date', false],
  ])('%s → %s', (_label, expiresAt, expected) => {
    expect(codeIsLive({ code: 'ABC123', expiresAt }, NOW)).toBe(expected)
  })

  it('is false for no code at all', () => {
    expect(codeIsLive(null, NOW)).toBe(false)
  })
})

// ---------------------------------------------------------------------------

function claimDeps(overrides: Partial<JoinClaimDeps> = {}): JoinClaimDeps {
  return {
    request: sameOrigin,
    now: () => NOW,
    allow: vi.fn().mockReturnValue(true),
    loadCode: vi.fn().mockResolvedValue({ code: 'ABC123', expiresAt: new Date(NOW + 3_600_000) }),
    loadMember: vi.fn().mockResolvedValue(cici),
    memberHasLogin: vi.fn().mockResolvedValue(false),
    makeSecret: () => 'secret-abc',
    insertClaim: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('handleJoinClaim — the request guard', () => {
  it.each([
    ['cross-site', { ...sameOrigin, secFetchSite: 'cross-site' }, 403],
    ['a foreign Origin', { ...sameOrigin, origin: 'https://evil.example' }, 403],
    ['a form body', { ...sameOrigin, contentType: 'text/plain' }, 415],
  ])('refuses %s before reading anything', async (_label, request, status) => {
    const d = claimDeps({ request })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(status)
    expect(d.loadCode).not.toHaveBeenCalled()
  })
})

describe('handleJoinClaim — refusals', () => {
  it.each([
    ['no body', null],
    ['no code', { memberId: '12' }],
    ['no member', { code: 'ABC123' }],
  ])('400s on %s', async (_label, input) => {
    const d = claimDeps()
    const result = await handleJoinClaim(input, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.join.badCode })
    expect(d.insertClaim).not.toHaveBeenCalled()
  })

  // Unlike `/api/app/forgot`, a throttled caller is told: whoever holds a live
  // code is standing in the room and there is nothing to hide from them.
  it('429s a throttled caller before the lookup', async () => {
    const d = claimDeps({ allow: vi.fn().mockReturnValue(false) })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(429)
    expect(result.body).toEqual({ error: APP_STRINGS.join.throttled })
    expect(d.loadCode).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown code', vi.fn().mockResolvedValue(null)],
    ['an expired code', vi.fn().mockResolvedValue({ code: 'ABC123', expiresAt: new Date(NOW - 1) })],
  ])('400s on %s without touching the roster', async (_label, loadCode) => {
    const d = claimDeps({ loadCode })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.join.badCode })
    expect(d.loadMember).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown member', null],
    ['a member who is not a moreškant', { ...cici, isMoreskant: false }],
    ['a retired member', { ...cici, active: false }],
  ])('400s on %s', async (_label, member) => {
    const d = claimDeps({ loadMember: vi.fn().mockResolvedValue(member) })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.join.badMember })
    expect(d.insertClaim).not.toHaveBeenCalled()
  })

  // The #462 rule in the same words: a Member somebody's login already points
  // at is not claimable, because that is taking an identity, not asking for one.
  it('409s a member who already has a login', async () => {
    const d = claimDeps({ memberHasLogin: vi.fn().mockResolvedValue(true) })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.join.alreadyHasLogin })
    expect(d.insertClaim).not.toHaveBeenCalled()
  })

  it('500s rather than claiming when the login lookup cannot answer', async () => {
    const d = claimDeps({ memberHasLogin: vi.fn().mockRejectedValue(new Error('db down')) })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(500)
    expect(d.insertClaim).not.toHaveBeenCalled()
  })

  // The partial unique index is the rule; the handler only reads its refusal.
  it('409s when a claim for that member is already waiting', async () => {
    const d = claimDeps({ insertClaim: vi.fn().mockResolvedValue(false) })
    const result = await handleJoinClaim({ code: 'ABC123', memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.join.alreadyPending })
    expect(result.secret).toBeUndefined()
  })
})

describe('handleJoinClaim — success', () => {
  it('writes the claim and hands the device its secret', async () => {
    const d = claimDeps()
    const result = await handleJoinClaim({ code: ' abc123 ', memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, status: 'pending' })
    expect(result.secret).toBe('secret-abc')
    expect(d.insertClaim).toHaveBeenCalledWith({
      memberId: 12,
      code: 'ABC123',
      secret: 'secret-abc',
      expiresAtMs: NOW + JOIN_CLAIM_TTL_MS,
    })
  })
})

// ---------------------------------------------------------------------------

function statusDeps(overrides: Partial<JoinStatusDeps> = {}): JoinStatusDeps {
  return {
    request: sameOrigin,
    now: () => NOW,
    secret: 'secret-abc',
    loadClaimBySecret: vi.fn().mockResolvedValue({
      id: 5,
      memberId: 12,
      status: 'pending',
      userId: null,
      expiresAt: new Date(NOW + 3_600_000),
    }),
    markClaimUsed: vi.fn().mockResolvedValue(undefined),
    openSession: vi.fn().mockResolvedValue('payload-token=jwt; Path=/; HttpOnly'),
    ...overrides,
  }
}

const approved = {
  id: 5,
  memberId: 12,
  status: 'approved',
  userId: 99,
  expiresAt: new Date(NOW + 3_600_000),
}

describe('handleJoinStatus', () => {
  it('says nothing at all without a cookie', async () => {
    const d = statusDeps({ secret: null })
    const result = await handleJoinStatus(d)
    expect(result.body).toEqual({ status: 'none' })
    expect(d.loadClaimBySecret).not.toHaveBeenCalled()
  })

  it('keeps the phone waiting while the claim is pending', async () => {
    const result = await handleJoinStatus(statusDeps())
    expect(result.body).toEqual({ status: 'pending' })
    expect(result.setCookie).toBeUndefined()
  })

  it.each([
    ['a rejected claim', { ...approved, status: 'rejected' }, 'rejected'],
    ['a spent claim', { ...approved, status: 'used' }, 'expired'],
    ['an expired claim', { ...approved, expiresAt: new Date(NOW - 1) }, 'expired'],
    ['a claim that is gone', null, 'expired'],
  ])('answers %s and clears the cookie', async (_label, claim, expected) => {
    const d = statusDeps({ loadClaimBySecret: vi.fn().mockResolvedValue(claim) })
    const result = await handleJoinStatus(d)
    expect(result.body).toEqual({ status: expected })
    expect(result.clearJoinCookie).toBe(true)
    expect(d.openSession).not.toHaveBeenCalled()
  })

  it('opens the session once the voditelj has said yes', async () => {
    const d = statusDeps({ loadClaimBySecret: vi.fn().mockResolvedValue(approved) })
    const result = await handleJoinStatus(d)
    expect(result.body).toEqual({ status: 'approved' })
    expect(result.setCookie).toBe('payload-token=jwt; Path=/; HttpOnly')
    expect(result.clearJoinCookie).toBe(true)
    expect(d.openSession).toHaveBeenCalledWith(99)
  })

  // One approval, one session: the claim is spent BEFORE the session is minted,
  // so two polls racing each other cannot both come back signed in.
  it('marks the claim spent before it opens anything', async () => {
    const order: string[] = []
    const d = statusDeps({
      loadClaimBySecret: vi.fn().mockResolvedValue(approved),
      markClaimUsed: vi.fn(async () => {
        order.push('used')
      }),
      openSession: vi.fn(async () => {
        order.push('session')
        return 'cookie'
      }),
    })
    await handleJoinStatus(d)
    expect(order).toEqual(['used', 'session'])
  })

  it('does not sign anybody in for an approved claim with no login on it', async () => {
    const d = statusDeps({
      loadClaimBySecret: vi.fn().mockResolvedValue({ ...approved, userId: null }),
    })
    const result = await handleJoinStatus(d)
    expect(result.body).toEqual({ status: 'pending' })
    expect(d.openSession).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

function decideDeps(overrides: Partial<JoinDecideDeps> = {}): JoinDecideDeps {
  return {
    request: sameOrigin,
    now: () => NOW,
    caller: { id: 3 },
    loadClaim: vi.fn().mockResolvedValue({
      id: 5,
      memberId: 12,
      status: 'pending',
      userId: null,
      expiresAt: new Date(NOW + 3_600_000),
    }),
    loadMember: vi.fn().mockResolvedValue(cici),
    memberHasLogin: vi.fn().mockResolvedValue(false),
    ensureLogin: vi.fn().mockResolvedValue({ ok: true, id: 99, username: 'cici' }),
    approve: vi.fn().mockResolvedValue(undefined),
    reject: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('handleJoinDecide', () => {
  it.each([
    ['no body', null],
    ['no claim', { decision: 'approve' }],
    ['no decision', { claimId: '5' }],
    ['a decision nobody offered', { claimId: '5', decision: 'maybe' }],
  ])('400s on %s', async (_label, input) => {
    const d = decideDeps()
    const result = await handleJoinDecide(input, d)
    expect(result.status).toBe(400)
    expect(d.ensureLogin).not.toHaveBeenCalled()
  })

  it('404s a claim that does not exist', async () => {
    const d = decideDeps({ loadClaim: vi.fn().mockResolvedValue(null) })
    expect((await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)).status).toBe(404)
  })

  it.each([
    ['already decided', { id: 5, memberId: 12, status: 'approved', userId: 99, expiresAt: new Date(NOW + 1000) }, APP_STRINGS.join.decided],
    ['expired', { id: 5, memberId: 12, status: 'pending', userId: null, expiresAt: new Date(NOW - 1) }, APP_STRINGS.join.claimExpired],
  ])('409s a claim that is %s', async (_label, claim, message) => {
    const d = decideDeps({ loadClaim: vi.fn().mockResolvedValue(claim) })
    const result = await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: message })
    expect(d.ensureLogin).not.toHaveBeenCalled()
  })

  it('rejects without opening anything', async () => {
    const d = decideDeps()
    const result = await handleJoinDecide({ claimId: '5', decision: 'reject' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, decision: 'reject' })
    expect(d.reject).toHaveBeenCalledWith(5, 3)
    expect(d.ensureLogin).not.toHaveBeenCalled()
  })

  // Minutes pass between the tap in the hall and the tap on the voditelj's
  // phone, and in that gap the dancer may have been invited by SMS or retired.
  it.each([
    ['the member retired', { loadMember: vi.fn().mockResolvedValue({ ...cici, active: false }) }, 400],
    ['the member was invited in the meantime', { memberHasLogin: vi.fn().mockResolvedValue(true) }, 409],
  ])('re-checks at approval time: %s', async (_label, overrides, status) => {
    const d = decideDeps(overrides)
    const result = await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)
    expect(result.status).toBe(status)
    expect(d.ensureLogin).not.toHaveBeenCalled()
    expect(d.approve).not.toHaveBeenCalled()
  })

  // The #462 takeover guard reaches all the way here: a Member whose login is a
  // colleague's staff account is not something a rehearsal approval may open.
  it('409s when the Member’s login turns out to be staff', async () => {
    const d = decideDeps({
      ensureLogin: vi.fn().mockResolvedValue({ ok: false, reason: 'staff-login' }),
    })
    const result = await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.invite.staffLogin })
    expect(d.approve).not.toHaveBeenCalled()
  })

  it('opens the login and records which one the claim ended in', async () => {
    const d = decideDeps()
    const result = await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, decision: 'approve', username: 'cici' })
    expect(d.approve).toHaveBeenCalledWith(5, 99, 3)
  })

  it('says the login exists when only the claim write failed', async () => {
    const d = decideDeps({ approve: vi.fn().mockRejectedValue(new Error('db down')) })
    const result = await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.join.approveFailed })
  })

  it('403s a cross-site POST', async () => {
    const d = decideDeps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } })
    const result = await handleJoinDecide({ claimId: '5', decision: 'approve' }, d)
    expect(result.status).toBe(403)
    expect(d.loadClaim).not.toHaveBeenCalled()
  })
})
