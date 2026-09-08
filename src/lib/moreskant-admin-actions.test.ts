import { describe, expect, it } from 'vitest'
import { inviteActionVisible } from './moreskant-admin-actions'

const voditelj = ['moreska']
const ticketAdmin = ['tickets', 'refunds', 'door']

describe('inviteActionVisible', () => {
  it('renders on a saved moreškant row for a voditelj', () => {
    expect(
      inviteActionVisible({
        collectionSlug: 'members',
        id: 12,
        isMoreskant: true,
        permissions: voditelj,
      }),
    ).toBe(true)
  })

  it.each([
    ['another collection', { collectionSlug: 'shows', id: 12, isMoreskant: true }],
    ['no collection at all', { id: 12, isMoreskant: true }],
    ['an unsaved document', { collectionSlug: 'members', id: null, isMoreskant: true }],
    ['an empty id', { collectionSlug: 'members', id: '', isMoreskant: true }],
    ['a member who is not a moreškant', { collectionSlug: 'members', id: 12, isMoreskant: false }],
    // A `tickets`-only account never receives `isMoreskant`: the field locks
    // READ to `moreska` (#420), so the value arrives undefined and the item
    // stays hidden without any permission list to consult.
    ['a member whose flag was stripped by field access', { collectionSlug: 'members', id: 12 }],
    [
      'a viewer known to lack moreska',
      { collectionSlug: 'members', id: 12, isMoreskant: true, permissions: ticketAdmin },
    ],
  ])('stays hidden for %s', (_label, input) => {
    expect(inviteActionVisible(input)).toBe(false)
  })

  it('treats an unreadable permission set as unknown, not as denied', () => {
    // `/api/users/me` runs with access applied and `Users.permissions` is
    // locked to `users`, so a voditelj's own client user has no list at all.
    for (const permissions of [undefined, null, 'moreska', {}]) {
      expect(
        inviteActionVisible({ collectionSlug: 'members', id: 12, isMoreskant: true, permissions }),
      ).toBe(true)
    }
  })
})
