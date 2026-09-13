import { describe, expect, it, vi } from 'vitest'
import { PERMISSIONS, type Permission } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'
import {
  handleSetShared,
  handleUpdatePermissions,
  parsePermissionSet,
  permissionDiff,
  type UpdatePermissionsDeps,
  type UsersTarget,
} from './users-admin'

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
    username: 'ttvigna',
    name: 'Tatjana Vigna',
    email: 'tatjana@moreska.eu',
    permissions: ['tickets', 'refunds'],
    shared: false,
    ...over,
  }
}

function deps(over: Partial<UpdatePermissionsDeps> = {}): UpdatePermissionsDeps {
  return {
    request: SAME_SITE,
    caller: { id: '1', shared: false },
    loadUser: async () => target(),
    save: vi.fn(async () => {}),
    ...over,
  }
}

describe('parsePermissionSet', () => {
  it('accepts the vocabulary and canonicalises its order', () => {
    expect(parsePermissionSet(['refunds', 'tickets'])).toEqual(['tickets', 'refunds'])
  })

  it('drops duplicates rather than storing a word twice', () => {
    expect(parsePermissionSet(['door', 'door'])).toEqual(['door'])
  })

  it('reads an empty set as a real answer: a login that reaches nothing', () => {
    expect(parsePermissionSet([])).toEqual([])
  })

  it('refuses a word outside the vocabulary instead of dropping it silently', () => {
    // `permissionsOf` drops an unknown word, which is right for READING a
    // stale row and wrong for a write: a typo'd permission must not answer 200.
    expect(parsePermissionSet(['tickets', 'superadmin'])).toBeNull()
    expect(parsePermissionSet('tickets')).toBeNull()
    expect(parsePermissionSet(null)).toBeNull()
  })
})

describe('permissionDiff', () => {
  it('names what was added and what was taken away', () => {
    expect(permissionDiff(['tickets', 'door'], ['tickets', 'refunds'])).toEqual({
      added: ['refunds'],
      removed: ['door'],
    })
  })

  it('is empty for an unchanged set, whatever order it arrived in', () => {
    expect(permissionDiff(['tickets', 'door'], ['door', 'tickets'])).toEqual({
      added: [],
      removed: [],
    })
  })
})

describe('PATCH /api/app/users/[id]/permissions', () => {
  it('saves the new set and reports the diff', async () => {
    const save = vi.fn(async () => {})
    const res = await handleUpdatePermissions('7', { permissions: ['tickets', 'door'] }, deps({ save }))

    expect(res.status).toBe(200)
    expect(save).toHaveBeenCalledWith('7', ['tickets', 'door'])
    expect(res.body).toMatchObject({ ok: true, added: ['door'], removed: ['refunds'] })
  })

  it('refuses a cross-site or non-JSON request before it reads anything', async () => {
    const loadUser = vi.fn(async () => target())
    const res = await handleUpdatePermissions(
      '7',
      { permissions: [] },
      deps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' }, loadUser }),
    )

    expect(res.status).toBe(403)
    expect(loadUser).not.toHaveBeenCalled()
  })

  it('404s an id that is not an account', async () => {
    const res = await handleUpdatePermissions(
      '99',
      { permissions: [] },
      deps({ loadUser: async () => null }),
    )
    expect(res.status).toBe(404)
  })

  it('refuses a shared caller outright, not only on its own row (ADR-0022)', async () => {
    const save = vi.fn(async () => {})
    const loadUser = vi.fn(async () => target())
    const res = await handleUpdatePermissions(
      '7',
      { permissions: ['door'] },
      deps({ caller: { id: '1', shared: true }, loadUser, save }),
    )

    // The shared `tehnika` password is written on a wall: a login several
    // people hold administers no account at all, its own included.
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.sharedCaller })
    expect(loadUser).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses leaving `users` on a shared account', async () => {
    const save = vi.fn(async () => {})
    const res = await handleUpdatePermissions(
      '9',
      { permissions: ['users'] },
      deps({
        loadUser: async () =>
          target({ id: '9', shared: true, email: 'sef@moreska.eu', permissions: ['door'] }),
        save,
      }),
    )

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.permissions.sharedUsers })
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a word outside the vocabulary with 400', async () => {
    const res = await handleUpdatePermissions('7', { permissions: ['owner'] }, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.permissions.invalid })
  })

  it('refuses the caller taking `users` off their own account', async () => {
    const save = vi.fn(async () => {})
    const res = await handleUpdatePermissions(
      '1',
      { permissions: ['tickets'] },
      deps({
        caller: { id: '1', shared: false },
        loadUser: async () => target({ id: '1', permissions: ['users', 'tickets'] }),
        save,
      }),
    )

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.permissions.selfLockout })
    expect(save).not.toHaveBeenCalled()
  })

  it('lets the caller change their own set as long as `users` stays', async () => {
    const res = await handleUpdatePermissions(
      '1',
      { permissions: ['users', 'dev'] },
      deps({
        caller: { id: '1', shared: false },
        loadUser: async () => target({ id: '1', permissions: ['users', 'tickets'] }),
      }),
    )
    expect(res.status).toBe(200)
  })

  it('lets another `users` holder be demoted: the guard is about the caller only', async () => {
    const res = await handleUpdatePermissions(
      '7',
      { permissions: ['door'] },
      deps({ loadUser: async () => target({ permissions: ['users'], email: 'x@moreska.eu' }) }),
    )
    expect(res.status).toBe(200)
  })

  it('refuses a named-person set on an account with no email', async () => {
    const save = vi.fn(async () => {})
    const res = await handleUpdatePermissions(
      '9',
      { permissions: ['tickets'] },
      deps({
        loadUser: async () => target({ id: '9', email: null, permissions: ['door'] }),
        save,
      }),
    )

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.permissions.emailRequired })
    expect(save).not.toHaveBeenCalled()
  })

  it('leaves an email-less door login alone: door needs no inbox', async () => {
    const res = await handleUpdatePermissions(
      '9',
      { permissions: ['door', 'moreskant'] },
      deps({ loadUser: async () => target({ id: '9', email: null, permissions: ['door'] }) }),
    )
    expect(res.status).toBe(200)
  })

  it('answers 500 rather than lying when the write throws', async () => {
    const res = await handleUpdatePermissions(
      '7',
      { permissions: ['door'] },
      deps({
        save: async () => {
          throw new Error('db')
        },
      }),
    )
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: S.permissions.failed })
  })

  it('covers every word in the vocabulary: none of them is rejected as unknown', () => {
    expect(parsePermissionSet([...PERMISSIONS])).toEqual([...PERMISSIONS] as Permission[])
  })
})

describe('POST /api/app/users/[id]/shared', () => {
  it('marks another account shared', async () => {
    const setShared = vi.fn(async () => {})
    const res = await handleSetShared('7', { shared: true }, { ...deps(), setShared })

    expect(res.status).toBe(200)
    expect(setShared).toHaveBeenCalledWith('7', true)
  })

  it('refuses marking an account shared while it holds `users`', async () => {
    const setShared = vi.fn(async () => {})
    const res = await handleSetShared(
      '7',
      { shared: true },
      {
        ...deps({ loadUser: async () => target({ permissions: ['users'] }) }),
        setShared,
      },
    )

    // Otherwise the rule above has a back door: grant `users` first, flip the
    // flag after.
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.permissions.sharedUsers })
    expect(setShared).not.toHaveBeenCalled()
  })

  it('refuses a shared caller here too', async () => {
    const setShared = vi.fn(async () => {})
    const res = await handleSetShared(
      '7',
      { shared: true },
      { ...deps({ caller: { id: '1', shared: true } }), setShared },
    )
    expect(res.status).toBe(403)
    expect(setShared).not.toHaveBeenCalled()
  })

  it('refuses the caller changing the flag on their own login', async () => {
    const setShared = vi.fn(async () => {})
    const res = await handleSetShared(
      '1',
      { shared: true },
      { ...deps({ loadUser: async () => target({ id: '1' }) }), setShared },
    )

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.shared.notSelf })
    expect(setShared).not.toHaveBeenCalled()
  })

  it('wants a boolean, not a guess', async () => {
    const res = await handleSetShared('7', { shared: 'da' }, { ...deps(), setShared: async () => {} })
    expect(res.status).toBe(400)
  })
})
