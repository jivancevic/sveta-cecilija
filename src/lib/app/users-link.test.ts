import { describe, expect, it, vi } from 'vitest'
import { APP_STRINGS } from './strings'
import { LINK_REFUSAL_MESSAGES, type LinkSelfMember } from './link-self'
import { handleLinkUser, type LinkUserDeps } from './users-link'
import type { UsersTarget } from './users-admin'

const S = APP_STRINGS.users

const SAME_SITE = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

function target(over: Partial<UsersTarget> = {}): UsersTarget {
  return {
    id: '7',
    username: 'lbrkic',
    name: 'Luka Brkić',
    email: null,
    permissions: ['door'],
    shared: false,
    ...over,
  }
}

function dancer(over: Partial<LinkSelfMember> = {}): LinkSelfMember {
  return { id: '18', name: 'Luka Brkić', isMoreskant: true, active: true, roles: [], ...over }
}

function deps(over: Partial<LinkUserDeps> = {}): LinkUserDeps {
  return {
    request: SAME_SITE,
    caller: { id: '1', shared: false },
    loadUser: async () => target(),
    loadMember: async () => dancer(),
    userIdsByMember: async () => [],
    partnerLinkable: async () => 'ok' as const,
    linkMember: vi.fn(async () => {}),
    linkPartner: vi.fn(async () => {}),
    ...over,
  }
}

describe('POST /api/app/users/[id]/link', () => {
  it('links a member and says so', async () => {
    const linkMember = vi.fn(async () => {})
    const res = await handleLinkUser('7', { member: '18' }, deps({ linkMember }))

    expect(res.status).toBe(200)
    expect(linkMember).toHaveBeenCalledWith('7', '18')
    expect(res.body).toMatchObject({ ok: true, message: S.link.saved })
  })

  it('unlinks a member on an explicit null', async () => {
    const linkMember = vi.fn(async () => {})
    const res = await handleLinkUser('7', { member: null }, deps({ linkMember }))

    expect(res.status).toBe(200)
    expect(linkMember).toHaveBeenCalledWith('7', null)
  })

  it('refuses a member somebody else already signs in as', async () => {
    const linkMember = vi.fn(async () => {})
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({ userIdsByMember: async () => ['12'], linkMember }),
    )

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: LINK_REFUSAL_MESSAGES.taken })
    expect(linkMember).not.toHaveBeenCalled()
  })

  it('is a no-op rather than "taken" when the link is already this account’s', async () => {
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({ userIdsByMember: async () => ['7'] }),
    )
    expect(res.status).toBe(200)
  })

  it('refuses a retired member, in the words /app/account uses', async () => {
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({ loadMember: async () => dancer({ active: false }) }),
    )

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: LINK_REFUSAL_MESSAGES['not-active'] })
  })

  it('refuses a member who is not a moreškant', async () => {
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({ loadMember: async () => dancer({ isMoreskant: false }) }),
    )

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: LINK_REFUSAL_MESSAGES['not-moreskant'] })
  })

  it('refuses a member id that is nobody', async () => {
    const res = await handleLinkUser('7', { member: '99' }, deps({ loadMember: async () => null }))
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: LINK_REFUSAL_MESSAGES.missing })
  })

  it('refuses rather than guesses when the Users table cannot be read', async () => {
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({
        userIdsByMember: async () => {
          throw new Error('db')
        },
      }),
    )
    expect(res.status).toBe(500)
  })

  it('links and unlinks a partner', async () => {
    const linkPartner = vi.fn(async () => {})
    expect((await handleLinkUser('7', { partner: '3' }, deps({ linkPartner }))).status).toBe(200)
    expect(linkPartner).toHaveBeenCalledWith('7', '3')

    expect((await handleLinkUser('7', { partner: null }, deps({ linkPartner }))).status).toBe(200)
    expect(linkPartner).toHaveBeenCalledWith('7', null)
  })

  it('refuses a partner id that is nobody', async () => {
    const res = await handleLinkUser(
      '7',
      { partner: '99' },
      deps({ partnerLinkable: async () => 'missing' as const }),
    )
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.link.unknownPartner })
  })

  it('wants exactly one link per request', async () => {
    expect((await handleLinkUser('7', {}, deps())).status).toBe(400)
    expect((await handleLinkUser('7', { partner: '3', member: '18' }, deps())).status).toBe(400)
  })

  it('refuses a deactivated partner the picker no longer offers', async () => {
    const linkPartner = vi.fn(async () => {})
    const res = await handleLinkUser(
      '7',
      { partner: '3' },
      deps({ partnerLinkable: async () => 'inactive' as const, linkPartner }),
    )
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.link.inactivePartner })
    expect(linkPartner).not.toHaveBeenCalled()
  })

  it('refuses a shared caller, whatever row it is aimed at', async () => {
    const linkMember = vi.fn(async () => {})
    const loadUser = vi.fn(async () => target())
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({ caller: { id: '1', shared: true }, loadUser, linkMember }),
    )
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.sharedCaller })
    expect(loadUser).not.toHaveBeenCalled()
    expect(linkMember).not.toHaveBeenCalled()
  })

  it('refuses a cross-site request before it writes', async () => {
    const linkMember = vi.fn(async () => {})
    const res = await handleLinkUser(
      '7',
      { member: '18' },
      deps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' }, linkMember }),
    )
    expect(res.status).toBe(403)
    expect(linkMember).not.toHaveBeenCalled()
  })

  it('404s an account id that is nobody', async () => {
    const res = await handleLinkUser('99', { member: '18' }, deps({ loadUser: async () => null }))
    expect(res.status).toBe(404)
  })
})
