import { describe, expect, it, vi } from 'vitest'
import { handleMemberCreate, handleMemberPatch, type MemberEditDeps } from './members-edit'
import type { MemberRosterRow } from './members-screen'
import { APP_STRINGS } from './strings'

// The write half of Članovi (#511): what a voditelj may change on a dancer, and
// what happens to everything they may not.
//
// The uniqueness of a nickname is deliberately NOT tested here: it is the
// Members `beforeValidate` hook's, which is the only writer that can see the
// other rows. What is tested is that its sentence reaches the voditelj.

const S = APP_STRINGS.members

const SAME_SITE = {
  origin: 'https://moreska.eu',
  secFetchSite: 'same-origin',
  contentType: 'application/json',
  allowedOrigins: ['https://moreska.eu'],
}

const CICI: MemberRosterRow = {
  id: '4',
  name: 'Ivan Marić',
  nickname: 'Ćiro',
  mobile: '0912345678',
  roles: ['crni', 'crni_kralj'],
  primaryRole: 'crni_kralj',
  active: true,
  yearRound: false,
  isMoreskant: true,
}

function deps(over: Partial<MemberEditDeps> = {}): MemberEditDeps {
  return {
    request: SAME_SITE,
    loadMember: vi.fn(async (_id: string): Promise<MemberRosterRow | null> => CICI),
    save: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
      ok: true as const,
      member: { ...CICI, ...(patch as Partial<MemberRosterRow>) },
    })),
    create: vi.fn(async (input: Record<string, unknown>) => ({
      ok: true as const,
      member: { ...CICI, id: '99', ...(input as Partial<MemberRosterRow>) },
    })),
    ...over,
  }
}

describe('handleMemberPatch', () => {
  it('refuses a cross-site request before it reads anything', async () => {
    const loadMember = vi.fn()
    const res = await handleMemberPatch(
      '4',
      { nickname: 'Novi' },
      deps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' }, loadMember }),
    )
    expect(res.status).toBe(403)
    expect(loadMember).not.toHaveBeenCalled()
  })

  it('saves the moreškant fields a voditelj owns', async () => {
    const d = deps()
    const res = await handleMemberPatch(
      '4',
      { nickname: ' Ćiro ', roles: ['crni', 'bili'], primaryRole: 'bili' },
      d,
    )
    expect(res.status).toBe(200)
    expect(d.save).toHaveBeenCalledWith('4', {
      nickname: 'Ćiro',
      roles: ['crni', 'bili'],
      primaryRole: 'bili',
    })
  })

  it('normalises the mobile the way the hook does', async () => {
    const d = deps()
    await handleMemberPatch('4', { mobile: ' 091 234 5678 ' }, d)
    expect(d.save).toHaveBeenCalledWith('4', { mobile: '091 234 5678' })
  })

  it('clears a mobile typed empty', async () => {
    const d = deps()
    await handleMemberPatch('4', { mobile: '' }, d)
    expect(d.save).toHaveBeenCalledWith('4', { mobile: null })
  })

  it('refuses a mobile no dialler could read, because the SMS invitation goes there', async () => {
    const d = deps()
    const res = await handleMemberPatch('4', { mobile: '123' }, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.badMobile })
    expect(d.save).not.toHaveBeenCalled()
  })

  // #651 (ADR-0028): `email` is not a key of this route any more. A body that
  // carries one changes nothing, because only the keys the reader knows are
  // read, and a patch with nothing else in it is the "nothing to save" refusal.
  it('ignores an e-mail, because the address belongs to the login now', async () => {
    const d = deps()
    const res = await handleMemberPatch('4', { email: 'ciro@example.com' }, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.nothingToSave })
    expect(d.save).not.toHaveBeenCalled()
  })

  it('refuses the attribution half, which is the blagajna’s (ADR-0019)', async () => {
    const d = deps()
    const res = await handleMemberPatch('4', { name: 'Netko Drugi' }, d)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.lockedField })
    expect(d.save).not.toHaveBeenCalled()

    const note = await handleMemberPatch('4', { note: 'nešto' }, d)
    expect(note.status).toBe(403)
  })

  it('lets a voditelj retire a dancer with `active`', async () => {
    const d = deps()
    const res = await handleMemberPatch('4', { active: false }, d)
    expect(res.status).toBe(200)
    expect(d.save).toHaveBeenCalledWith('4', { active: false })
  })

  it('lets a voditelj mark a dancer year-round, and refuses a non-boolean', async () => {
    const d = deps()
    const res = await handleMemberPatch('4', { yearRound: true }, d)
    expect(res.status).toBe(200)
    expect(d.save).toHaveBeenCalledWith('4', { yearRound: true })

    const bad = await handleMemberPatch('4', { yearRound: 'da' }, deps())
    expect(bad.status).toBe(400)
  })

  it('refuses a patch with nothing in it', async () => {
    const res = await handleMemberPatch('4', {}, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.nothingToSave })
  })

  it('404s an id nothing is behind', async () => {
    const res = await handleMemberPatch('4', { nickname: 'X' }, deps({ loadMember: async () => null }))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: S.notFound })
  })

  it('404s a Member that is only a comp-attribution name, never converting one', async () => {
    const d = deps({ loadMember: async () => ({ ...CICI, isMoreskant: false }) })
    const res = await handleMemberPatch('4', { nickname: 'X' }, d)
    expect(res.status).toBe(404)
    expect(d.save).not.toHaveBeenCalled()
  })

  // ── The hook's own rules, mirrored before the write ────────────────────────

  it('refuses an empty nickname with the hook’s sentence', async () => {
    const res = await handleMemberPatch('4', { nickname: '  ' }, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Moreškant mora imati nadimak.' })
  })

  it('refuses a primary role that is not among the dance roles', async () => {
    const res = await handleMemberPatch('4', { roles: ['crni'], primaryRole: 'bula' }, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: 'Glavna uloga "Bula" mora biti među plesnim ulogama moreškanta.',
    })
  })

  it('refuses a king without the army the king belongs to', async () => {
    const res = await handleMemberPatch(
      '4',
      { roles: ['bili_kralj'], primaryRole: 'bili_kralj' },
      deps(),
    )
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Uloga "Bili kralj" traži i ulogu "Bili".' })
  })

  it('refuses the last dance role being taken away', async () => {
    const res = await handleMemberPatch('4', { roles: [] }, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Moreškant mora imati barem jednu plesnu ulogu.' })
  })

  it('surfaces the hook’s own refusal, which is where uniqueness is decided', async () => {
    const d = deps({
      save: async () => ({
        ok: false as const,
        message: 'Nadimak "Bepo" već koristi drugi moreškant. Nadimci moraju biti jedinstveni.',
      }),
    })
    const res = await handleMemberPatch('4', { nickname: 'Bepo' }, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: 'Nadimak "Bepo" već koristi drugi moreškant. Nadimci moraju biti jedinstveni.',
    })
  })
})

describe('handleMemberCreate', () => {
  const NEW = {
    name: 'Pero Perić',
    nickname: 'Pero',
    roles: ['crni'],
    primaryRole: 'crni',
  }

  it('refuses a cross-site request', async () => {
    const d = deps({ request: { ...SAME_SITE, secFetchSite: 'cross-site' } })
    const res = await handleMemberCreate(NEW, d)
    expect(res.status).toBe(403)
    expect(d.create).not.toHaveBeenCalled()
  })

  it('creates a dancer, flagged as a moreškant and active', async () => {
    const d = deps()
    const res = await handleMemberCreate(NEW, d)
    expect(res.status).toBe(200)
    expect(d.create).toHaveBeenCalledWith({
      name: 'Pero Perić',
      nickname: 'Pero',
      roles: ['crni'],
      primaryRole: 'crni',
      isMoreskant: true,
    })
  })

  it('carries an optional mobile through the same normalisation', async () => {
    const d = deps()
    await handleMemberCreate({ ...NEW, mobile: ' 0912345678 ' }, d)
    expect(d.create).toHaveBeenCalledWith({
      name: 'Pero Perić',
      nickname: 'Pero',
      roles: ['crni'],
      primaryRole: 'crni',
      mobile: '0912345678',
      isMoreskant: true,
    })
  })

  it('refuses the attribution note on create too, rather than dropping it', async () => {
    // A create must not be a way around the lock a patch enforces: the caller
    // who sent it has to learn that it did not land.
    const d = deps()
    const res = await handleMemberCreate({ ...NEW, note: 'nešto' }, d)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: S.lockedField })
    expect(d.create).not.toHaveBeenCalled()
  })

  it('requires a name, which is the one field the moreškant rules do not cover', async () => {
    const res = await handleMemberCreate({ ...NEW, name: '  ' }, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: S.missingName })
  })

  it('applies the same moreškant rules a profile edit applies', async () => {
    const res = await handleMemberCreate({ ...NEW, nickname: '' }, deps())
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Moreškant mora imati nadimak.' })
  })

  it('surfaces the hook’s refusal on create too', async () => {
    const d = deps({
      create: async () => ({ ok: false as const, message: 'Nadimak "Pero" već koristi drugi moreškant.' }),
    })
    const res = await handleMemberCreate(NEW, d)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Nadimak "Pero" već koristi drugi moreškant.' })
  })
})
