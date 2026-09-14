import { describe, expect, it, vi } from 'vitest'
import { PERMISSIONS, type Permission } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'
import {
  handleSetShared,
  handleUpdateEmail,
  handleUpdateName,
  handleUpdatePermissions,
  parsePermissionSet,
  permissionDiff,
  type SetEmailDeps,
  type SetNameDeps,
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

describe('PATCH /api/app/users/[id]/email', () => {
  function emailDeps(over: Partial<SetEmailDeps> = {}): SetEmailDeps {
    return {
      request: SAME_SITE,
      caller: { id: '1', shared: false },
      loadUser: async () => target(),
      emailTaken: vi.fn(async () => false),
      setEmail: vi.fn(async () => {}),
      ...over,
    }
  }

  it('writes a new address, trimmed and lowercased', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail('7', { email: '  Tatjana.Vigna@Moreska.EU ' }, emailDeps({ setEmail }))

    expect(res.status).toBe(200)
    expect(setEmail).toHaveBeenCalledWith('7', 'tatjana.vigna@moreska.eu')
    expect(res.body.message).toBe(S.email.saved)
  })

  it('puts an address on a login that had none', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail(
      '7',
      { email: 'tehnika@moreska.eu' },
      emailDeps({ loadUser: async () => target({ permissions: ['door'], email: null }), setEmail }),
    )

    expect(res.status).toBe(200)
    expect(setEmail).toHaveBeenCalledWith('7', 'tehnika@moreska.eu')
  })

  it('refuses something that is not an address', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail('7', { email: 'tatjana(at)moreska' }, emailDeps({ setEmail }))

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.create.badEmail })
    expect(setEmail).not.toHaveBeenCalled()
  })

  it('refuses an address that already belongs to somebody else', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail(
      '7',
      { email: 'josip@moreska.eu' },
      emailDeps({ emailTaken: async () => true, setEmail }),
    )

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: S.create.emailTaken })
    expect(setEmail).not.toHaveBeenCalled()
  })

  it('does not ask whether the row’s OWN address is taken', async () => {
    // Re-saving the same address must never collide with itself, so the
    // unchanged branch answers before the lookup is made at all.
    const emailTaken = vi.fn(async () => true)
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail(
      '7',
      { email: 'TATJANA@moreska.eu' },
      emailDeps({ loadUser: async () => target({ email: 'tatjana@moreska.eu' }), emailTaken, setEmail }),
    )

    expect(res.status).toBe(200)
    expect(res.body.message).toBe(S.email.unchanged)
    expect(emailTaken).not.toHaveBeenCalled()
    expect(setEmail).not.toHaveBeenCalled()
  })

  it('clears the address on a login that does not need one', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail(
      '7',
      { email: '  ' },
      emailDeps({
        loadUser: async () => target({ permissions: ['door'], email: 'tehnika@moreska.eu' }),
        setEmail,
      }),
    )

    expect(res.status).toBe(200)
    expect(setEmail).toHaveBeenCalledWith('7', null)
    expect(res.body.message).toBe(S.email.cleared)
  })

  it('refuses to clear the address a named-person set depends on', async () => {
    // The same rule the Users beforeValidate hook applies, said in Croatian and
    // before the write, naming Dozvole as the repair.
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail(
      '7',
      { email: '' },
      emailDeps({ loadUser: async () => target({ permissions: ['tickets'] }), setEmail }),
    )

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.email.required })
    expect(setEmail).not.toHaveBeenCalled()
  })

  it('refuses a value that is not a string', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail('7', { email: ['a@b.hr'] }, emailDeps({ setEmail }))

    expect(res.status).toBe(400)
    expect(setEmail).not.toHaveBeenCalled()
  })

  it('refuses a shared caller and a cross-site request', async () => {
    const setEmail = vi.fn(async () => {})
    const shared = await handleUpdateEmail(
      '7',
      { email: 'a@b.hr' },
      emailDeps({ caller: { id: '1', shared: true }, setEmail }),
    )
    const cross = await handleUpdateEmail(
      '7',
      { email: 'a@b.hr' },
      emailDeps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' }, setEmail }),
    )

    expect([shared.status, cross.status]).toEqual([403, 403])
    expect(setEmail).not.toHaveBeenCalled()
  })

  it('404s on an id that is nobody', async () => {
    const res = await handleUpdateEmail(
      '999',
      { email: 'a@b.hr' },
      emailDeps({ loadUser: async () => null }),
    )
    expect(res.status).toBe(404)
  })

  it('answers 500 when the write fails, without claiming it landed', async () => {
    const res = await handleUpdateEmail(
      '7',
      { email: 'nova@moreska.eu' },
      emailDeps({
        setEmail: async () => {
          throw new Error('db down')
        },
      }),
    )

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: S.email.failed })
  })

  it('answers 500 rather than writing when the taken lookup fails', async () => {
    const setEmail = vi.fn(async () => {})
    const res = await handleUpdateEmail(
      '7',
      { email: 'nova@moreska.eu' },
      emailDeps({
        emailTaken: async () => {
          throw new Error('db down')
        },
        setEmail,
      }),
    )

    expect(res.status).toBe(500)
    expect(setEmail).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/app/users/[id]/name', () => {
  function nameDeps(over: Partial<SetNameDeps> = {}): SetNameDeps {
    return {
      request: SAME_SITE,
      caller: { id: '1', shared: false },
      loadUser: async () => target({ name: null }),
      setName: vi.fn(async () => {}),
      ...over,
    }
  }

  it('writes the trimmed name', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName('7', { name: '  Tatjana Vigna ' }, nameDeps({ setName }))

    expect(res.status).toBe(200)
    expect(setName).toHaveBeenCalledWith('7', 'Tatjana Vigna')
    expect(res.body.message).toBe(S.name.saved)
  })

  it('clears the name on an empty field: a shared login is not a person', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName(
      '7',
      { name: '   ' },
      nameDeps({ loadUser: async () => target({ name: 'Tehnika' }), setName }),
    )

    expect(res.status).toBe(200)
    // Null, never '': the absence of a name has one spelling in the column.
    expect(setName).toHaveBeenCalledWith('7', null)
    expect(res.body.message).toBe(S.name.cleared)
  })

  it('caps a paste at 80 characters rather than letting it title a screen', async () => {
    const setName = vi.fn(async () => {})
    await handleUpdateName('7', { name: 'x'.repeat(200) }, nameDeps({ setName }))
    expect(setName).toHaveBeenCalledWith('7', 'x'.repeat(80))
  })

  it('does not write when the name is the one already on the row', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName(
      '7',
      { name: 'Tatjana Vigna' },
      nameDeps({ loadUser: async () => target({ name: 'Tatjana Vigna' }), setName }),
    )

    expect(res.status).toBe(200)
    expect(res.body.message).toBe(S.name.unchanged)
    expect(setName).not.toHaveBeenCalled()
  })

  it('refuses a name that is not a string', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName('7', { name: 42 }, nameDeps({ setName }))

    expect(res.status).toBe(400)
    expect(setName).not.toHaveBeenCalled()
  })

  it('refuses a shared caller, like the other six routes', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName(
      '7',
      { name: 'Tatjana Vigna' },
      nameDeps({ caller: { id: '1', shared: true }, setName }),
    )

    expect(res.status).toBe(403)
    expect(setName).not.toHaveBeenCalled()
  })

  it('refuses a cross-site request', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName(
      '7',
      { name: 'Tatjana Vigna' },
      nameDeps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' }, setName }),
    )

    expect(res.status).toBe(403)
    expect(setName).not.toHaveBeenCalled()
  })

  it('404s on an id that is nobody', async () => {
    const res = await handleUpdateName('999', { name: 'X' }, nameDeps({ loadUser: async () => null }))
    expect(res.status).toBe(404)
  })

  it('lets the caller rename their OWN login: a name grants nothing', async () => {
    const setName = vi.fn(async () => {})
    const res = await handleUpdateName(
      '1',
      { name: 'Josip Ivančević' },
      nameDeps({ loadUser: async () => target({ id: '1', name: null }), setName }),
    )

    expect(res.status).toBe(200)
    expect(setName).toHaveBeenCalledWith('1', 'Josip Ivančević')
  })

  it('answers 500 when the write fails, without claiming it landed', async () => {
    const res = await handleUpdateName(
      '7',
      { name: 'Tatjana Vigna' },
      nameDeps({
        setName: async () => {
          throw new Error('db down')
        },
      }),
    )

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: S.name.failed })
  })
})
