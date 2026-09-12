import { describe, expect, it, vi } from 'vitest'
import {
  eligibleCandidates,
  handleLinkSelf,
  heldPermissions,
  memberEligibility,
  toCandidate,
  withMoreskant,
  type LinkSelfDeps,
  type LinkSelfMember,
} from './link-self'
import { APP_STRINGS } from './strings'

const sameOrigin = {
  origin: null,
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const cici: LinkSelfMember = {
  id: 12,
  name: 'Ivan Fabris',
  nickname: 'Cici',
  roles: ['crni', 'crni_kralj'],
  primaryRole: 'crni_kralj',
  active: true,
  isMoreskant: true,
}

function deps(overrides: Partial<LinkSelfDeps> = {}): LinkSelfDeps {
  return {
    request: sameOrigin,
    caller: { id: 7, permissions: ['moreska'] },
    callerMemberId: null,
    loadMember: vi.fn().mockResolvedValue(cici),
    findUserIdsByMember: vi.fn().mockResolvedValue([]),
    link: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('memberEligibility', () => {
  const rows: [string, LinkSelfMember | null, boolean, string | null][] = [
    ['an active moreškant nobody has claimed', cici, false, null],
    ['a Member that does not exist', null, false, 'missing'],
    ['a Member with no id', { id: undefined as unknown as number }, false, 'missing'],
    ['a member who is not a dancer', { ...cici, isMoreskant: false }, false, 'not-moreskant'],
    ['a member whose flag is missing', { ...cici, isMoreskant: undefined }, false, 'not-moreskant'],
    ['a retired dancer', { ...cici, active: false }, false, 'not-active'],
    ['a dancer who already has a login', cici, true, 'taken'],
    ['a retired dancer with a login (the row loses first)', { ...cici, active: false }, true, 'not-active'],
  ]

  it.each(rows)('%s', (_label, member, hasLogin, expected) => {
    expect(memberEligibility(member, hasLogin)).toBe(expected)
  })

  it('treats a missing `active` as active: the column defaults to true', () => {
    expect(memberEligibility({ ...cici, active: undefined }, false)).toBeNull()
  })

  it('accepts only a literal true for isMoreskant', () => {
    expect(memberEligibility({ ...cici, isMoreskant: 'true' }, false)).toBe('not-moreskant')
    expect(memberEligibility({ ...cici, isMoreskant: 1 }, false)).toBe('not-moreskant')
  })
})

describe('toCandidate', () => {
  it('projects a Member and never spreads it', () => {
    const withEmail = { ...cici, email: 'cici@example.com' } as LinkSelfMember
    expect(toCandidate(withEmail)).toEqual({
      id: '12',
      name: 'Ivan Fabris',
      nickname: 'Cici',
      roles: ['crni', 'crni_kralj'],
      primaryRole: 'crni_kralj',
    })
  })

  it('drops role entries that are not strings', () => {
    expect(toCandidate({ ...cici, roles: ['crni', 7, null] }).roles).toEqual(['crni'])
  })

  it('survives a row with nothing but an id', () => {
    expect(toCandidate({ id: 3 })).toEqual({
      id: '3',
      name: '',
      nickname: null,
      roles: [],
      primaryRole: null,
    })
  })
})

describe('eligibleCandidates', () => {
  const roster: LinkSelfMember[] = [
    { ...cici, id: 12, nickname: 'Šime' },
    { ...cici, id: 13, nickname: 'Ante' },
    { ...cici, id: 14, nickname: 'Cici' },
    { ...cici, id: 15, nickname: 'Retired', active: false },
    { ...cici, id: 16, nickname: 'NotADancer', isMoreskant: false },
  ]

  it('offers only the unclaimed active dancers', () => {
    const out = eligibleCandidates(roster, new Set(['13']))
    expect(out.map((c) => c.id)).toEqual(['14', '12'])
  })

  it('sorts by nickname, Croatian, case-insensitively', () => {
    const out = eligibleCandidates(roster, new Set())
    expect(out.map((c) => c.nickname)).toEqual(['Ante', 'Cici', 'Šime'])
  })

  it('falls back to the name when there is no nickname', () => {
    const out = eligibleCandidates([{ ...cici, id: 20, nickname: null, name: 'Ana' }], new Set())
    expect(out[0]!.name).toBe('Ana')
  })

  it('is empty when every dancer already has a login', () => {
    expect(eligibleCandidates(roster, new Set(['12', '13', '14']))).toEqual([])
  })
})

describe('withMoreskant / heldPermissions', () => {
  it('adds moreskant to a voditelj who does not hold it', () => {
    expect(withMoreskant(['moreska'])).toEqual(['moreska', 'moreskant'])
  })

  it('never duplicates it', () => {
    expect(withMoreskant(['moreska', 'moreskant'])).toEqual(['moreska', 'moreskant'])
  })

  it('adds nothing else, so linking cannot widen an account', () => {
    expect(withMoreskant(['moreska', 'tickets'])).toEqual(['moreska', 'tickets', 'moreskant'])
  })

  it('drops anything that is not a string, on both helpers', () => {
    expect(withMoreskant(['moreska', 7, null])).toEqual(['moreska', 'moreskant'])
    expect(heldPermissions(['moreska', 7, null])).toEqual(['moreska'])
    expect(heldPermissions(undefined)).toEqual([])
  })
})

describe('handleLinkSelf — the request guard', () => {
  it('403s a cross-site POST before it reads anything', async () => {
    const d = deps({ request: { ...sameOrigin, secFetchSite: 'cross-site' } })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.rejected })
    expect(d.loadMember).not.toHaveBeenCalled()
    expect(d.link).not.toHaveBeenCalled()
  })

  it('403s a foreign Origin', async () => {
    const d = deps({ request: { ...sameOrigin, origin: 'https://evil.example' } })
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(403)
    expect(d.link).not.toHaveBeenCalled()
  })

  it('415s a form-encoded body', async () => {
    const d = deps({ request: { ...sameOrigin, contentType: 'application/x-www-form-urlencoded' } })
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(415)
    expect(d.link).not.toHaveBeenCalled()
  })
})

describe('handleLinkSelf — the refusals', () => {
  it('refuses a caller who already carries a link, before reading the member', async () => {
    const d = deps({ callerMemberId: '99' })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.alreadyLinked })
    expect(d.loadMember).not.toHaveBeenCalled()
    expect(d.link).not.toHaveBeenCalled()
  })

  it('refuses a caller relinking to the member they already point at', async () => {
    const d = deps({ callerMemberId: '12' })
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(409)
    expect(d.link).not.toHaveBeenCalled()
  })

  it('400s a body with no member', async () => {
    const d = deps()
    for (const body of [null, {}, { memberId: '' }, { memberId: '   ' }, { memberId: {} }]) {
      const result = await handleLinkSelf(body as { memberId?: unknown }, d)
      expect(result.status).toBe(400)
      expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.missingMember })
    }
    expect(d.link).not.toHaveBeenCalled()
  })

  it('400s an unknown member', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue(null) })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.notFound })
  })

  it('400s a member who is not flagged as a dancer', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue({ ...cici, isMoreskant: false }) })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.notMoreskant })
  })

  it('400s a retired member', async () => {
    const d = deps({ loadMember: vi.fn().mockResolvedValue({ ...cici, active: false }) })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.notActive })
  })

  it('409s a member somebody else already logs in as', async () => {
    const d = deps({ findUserIdsByMember: vi.fn().mockResolvedValue(['41']) })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.taken })
    expect(d.link).not.toHaveBeenCalled()
  })

  it('refuses rather than guesses when the Users table cannot be read', async () => {
    const d = deps({ findUserIdsByMember: vi.fn().mockRejectedValue(new Error('down')) })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(500)
    expect(d.link).not.toHaveBeenCalled()
  })

  it('reports a failed write rather than claiming a link', async () => {
    const d = deps({ link: vi.fn().mockRejectedValue(new Error('nope')) })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.failed })
  })

  it('treats a member that throws on read as missing', async () => {
    const d = deps({ loadMember: vi.fn().mockRejectedValue(new Error('boom')) })
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(400)
  })
})

describe('handleLinkSelf — the link', () => {
  it('writes the member and adds moreskant, and nothing else', async () => {
    const d = deps()
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      memberId: '12',
      message: APP_STRINGS.linkSelf.linked,
    })
    expect(d.link).toHaveBeenCalledWith(7, {
      member: '12',
      permissions: ['moreska', 'moreskant'],
    })
  })

  it('accepts a numeric member id', async () => {
    const d = deps()
    expect((await handleLinkSelf({ memberId: 12 }, d)).status).toBe(200)
    expect(d.link).toHaveBeenCalledWith(7, { member: '12', permissions: ['moreska', 'moreskant'] })
  })

  it('leaves an already-moreskant permission set untouched', async () => {
    const d = deps({ caller: { id: 7, permissions: ['moreska', 'moreskant'] } })
    await handleLinkSelf({ memberId: '12' }, d)
    expect(d.link).toHaveBeenCalledWith(7, { member: '12', permissions: ['moreska', 'moreskant'] })
  })
})

describe('handleLinkSelf — the race', () => {
  it('backs the link out when a second voditelj claimed the same member', async () => {
    const findUserIdsByMember = vi
      .fn()
      .mockResolvedValueOnce([]) // before the write: free
      .mockResolvedValueOnce(['7', '41']) // after: somebody else got in too
    const d = deps({ findUserIdsByMember })
    const result = await handleLinkSelf({ memberId: '12' }, d)
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: APP_STRINGS.linkSelf.taken })
    expect(d.unlink).toHaveBeenCalledWith(7, { permissions: ['moreska'] })
  })

  it('keeps the link when the only row after the write is the caller', async () => {
    const findUserIdsByMember = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['7'])
    const d = deps({ findUserIdsByMember })
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(200)
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('does not un-link on a re-check that simply failed', async () => {
    const findUserIdsByMember = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('down'))
    const d = deps({ findUserIdsByMember })
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(200)
    expect(d.unlink).not.toHaveBeenCalled()
  })

  it('still refuses when the revert itself fails', async () => {
    const findUserIdsByMember = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['41'])
    const d = deps({ findUserIdsByMember, unlink: vi.fn().mockRejectedValue(new Error('nope')) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handleLinkSelf({ memberId: '12' }, d)).status).toBe(409)
    spy.mockRestore()
  })
})
