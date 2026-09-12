import { describe, expect, it, vi } from 'vitest'
import { Lineups } from './Lineups'
import { Shows, cascadeShowLineupDelete } from './Shows'
import { Members, cascadeMemberLineupDelete } from './Members'
import { DANCE_ROLES } from '@/lib/moreskant-profile'

// #432 — who reaches the lineups collection, and the two cascade hooks.
//
// Kept beside `access.test.ts` rather than inside it because it also covers the
// cascades, the way `attendance-cascade-delete.test.ts` does for #422.

const voditelj = { id: '1', permissions: ['moreska'] }
const developer = {
  id: '2',
  permissions: ['users', 'tickets', 'refunds', 'door', 'partner', 'season_stats', 'moreska', 'moreskant', 'dev'],
}
const moreskant = { id: '3', permissions: ['moreskant'] }
const ticketAdmin = { id: '4', permissions: ['tickets', 'refunds'] }
const doorAccount = { id: '5', permissions: ['door'] }
const partner = { id: '6', permissions: ['partner'] }
const noPermissions = { id: '7', permissions: [] }
const anon = null

const OPS = ['read', 'create', 'update', 'delete'] as const
const WRITES = ['create', 'update', 'delete'] as const

function access(op: (typeof OPS)[number], user: unknown) {
  const fn = Lineups.access?.[op] as ((args: { req: { user: unknown } }) => unknown) | undefined
  if (typeof fn !== 'function') return true
  return fn({ req: { user } })
}

describe('Lineups access', () => {
  it('a voditelj reads and mutates every row', () => {
    for (const op of OPS) {
      expect(access(op, voditelj)).toBe(true)
      expect(access(op, developer)).toBe(true)
    }
  })

  // Stories 33 and 34: a confirmed lineup is society-wide news, a draft
  // reaches nobody. The Where reaches THROUGH the relationship rather than
  // carrying a list of ids, so it cannot go stale between the access decision
  // and the query.
  it('a moreškant reads only rows of a CONFIRMED performance, as a Where', () => {
    expect(access('read', moreskant)).toEqual({
      'performance.lineupConfirmed': { equals: true },
    })
  })

  // The hole this asserts against is the one attendance-access.ts documents:
  // Payload's create only tests the access result for TRUTHINESS, so a Where
  // here would read as a plain "allowed" and let a dancer POST /api/lineups for
  // anybody with the session cookie /app hands them.
  it('a moreškant may NOT create, update or delete a row', () => {
    for (const op of WRITES) expect(access(op, moreskant)).toBe(false)
  })

  it('no write access ever answers with a Where', () => {
    for (const op of WRITES) {
      for (const user of [voditelj, developer, moreskant, ticketAdmin, anon]) {
        expect(typeof access(op, user)).toBe('boolean')
      }
    }
  })

  it.each([
    ['tickets backoffice', ticketAdmin],
    ['door', doorAccount],
    ['partner', partner],
    ['no permission set', noPermissions],
    ['anonymous', anon],
  ])('%s reaches nothing', (_label, user) => {
    for (const op of OPS) expect(access(op, user)).toBe(false)
  })

  it('is in the sidebar for the voditelj only', () => {
    const hidden = (user: unknown) =>
      (Lineups.admin?.hidden as (args: { user: unknown }) => boolean)({ user })
    expect(hidden(voditelj)).toBe(false)
    expect(hidden(developer)).toBe(false)
    for (const user of [moreskant, ticketAdmin, doorAccount, partner, noPermissions, anon]) {
      expect(hidden(user)).toBe(true)
    }
  })

  it('carries the dance-role vocabulary and nothing invented beside it', () => {
    const role = Lineups.fields.find(
      (f) => (f as { name?: string }).name === 'role',
    ) as { options?: { value: string }[] } | undefined
    expect(role?.options?.map((o) => o.value)).toEqual([...DANCE_ROLES])
  })
})

describe.each([
  ['Shows', Shows, cascadeShowLineupDelete, 'performance'],
  ['Members', Members, cascadeMemberLineupDelete, 'member'],
] as const)('%s beforeDelete lineup cascade', (_name, collection, hook, field) => {
  it('is wired as a beforeDelete hook', () => {
    expect(collection.hooks?.beforeDelete).toContain(hook)
  })

  // Both FKs are ON DELETE SET NULL on NOT NULL columns — Payload's own shape,
  // which db/schema mirrors and the drift gate enforces — so deleting a
  // performance or a member that is in a postava throws unless the rows go
  // first, in the same transaction (proved against real Postgres by
  // scripts/probe-lineup-schema.mjs).
  it('deletes the lineup rows that point at it, in the same transaction', async () => {
    const del = vi.fn().mockResolvedValue({ docs: [] })
    const req = { payload: { delete: del }, transactionID: 'tx-1' }

    await hook({ req, id: 42, collection: {} as never, context: {} } as never)

    expect(del).toHaveBeenCalledWith({
      collection: 'lineups',
      where: { [field]: { equals: 42 } },
      req,
      overrideAccess: true,
    })
  })

  it('propagates a failure so the delete rolls back', async () => {
    const del = vi.fn().mockRejectedValue(new Error('boom'))
    const req = { payload: { delete: del }, transactionID: 'tx-2' }
    await expect(
      hook({ req, id: 7, collection: {} as never, context: {} } as never),
    ).rejects.toThrow('boom')
  })
})
