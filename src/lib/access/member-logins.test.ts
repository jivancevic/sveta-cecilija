import { describe, expect, it, vi } from 'vitest'
import {
  MEMBER_LOGIN_CONTEXT_KEY,
  loadMemberIdsWithLogin,
  memberIdsWithLogin,
} from './member-logins'

function finder(docs: Record<string, unknown>[]) {
  return { find: vi.fn().mockResolvedValue({ docs }) }
}

describe('loadMemberIdsWithLogin', () => {
  it('collects the member ids behind every login, as strings', async () => {
    const payload = finder([
      { id: 1, member: 12 },
      { id: 2, member: '13' },
      // Populated at a greater depth: the id is still the id.
      { id: 3, member: { id: 14 } },
    ])
    expect(await loadMemberIdsWithLogin(payload)).toEqual(new Set(['12', '13', '14']))
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        where: { member: { exists: true } },
        overrideAccess: true,
      }),
    )
  })

  it('ignores accounts with no link', async () => {
    const payload = finder([{ id: 1 }, { id: 2, member: null }])
    expect(await loadMemberIdsWithLogin(payload)).toEqual(new Set())
  })
})

describe('memberIdsWithLogin', () => {
  it('queries once for a whole list view', async () => {
    const payload = finder([{ id: 1, member: 12 }])
    const context: Record<string, unknown> = {}
    const rows = await Promise.all([
      memberIdsWithLogin(payload, context),
      memberIdsWithLogin(payload, context),
      memberIdsWithLogin(payload, context),
    ])
    expect(payload.find).toHaveBeenCalledTimes(1)
    for (const set of rows) expect(set).toEqual(new Set(['12']))
    expect(context[MEMBER_LOGIN_CONTEXT_KEY]).toBeInstanceOf(Promise)
  })

  it('still answers without a context, only without the saving', async () => {
    const payload = finder([{ id: 1, member: 12 }])
    await memberIdsWithLogin(payload, undefined)
    await memberIdsWithLogin(payload, undefined)
    expect(payload.find).toHaveBeenCalledTimes(2)
  })

  it('answers "nobody" rather than throwing when the query fails', async () => {
    const payload = { find: vi.fn().mockRejectedValue(new Error('db down')) }
    expect(await memberIdsWithLogin(payload, {})).toEqual(new Set())
  })

  it('answers "nobody" when there is no payload at all', async () => {
    expect(await memberIdsWithLogin(undefined, {})).toEqual(new Set())
  })
})
