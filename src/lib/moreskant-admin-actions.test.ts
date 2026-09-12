import { describe, expect, it } from 'vitest'
import { inviteActionVisible, inviteAllActionVisible } from './moreskant-admin-actions'

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

describe('inviteAllActionVisible', () => {
  const voditeljDocs = [{ id: 1, name: 'Ivan', isMoreskant: true }]
  // What a `tickets`-only account receives: the moreškant fields are stripped
  // by field access, so the key is absent rather than false.
  const backofficeDocs = [{ id: 1, name: 'Ivan' }]

  it('renders on the Members list for a voditelj', () => {
    expect(
      inviteAllActionVisible({
        collectionSlug: 'members',
        docs: voditeljDocs,
        permissions: voditelj,
      }),
    ).toBe(true)
  })

  it.each([
    ['another collection', { collectionSlug: 'shows', docs: voditeljDocs }],
    ['rows stripped of the moreškant fields', { collectionSlug: 'members', docs: backofficeDocs }],
    ['an empty list, which has nobody to invite', { collectionSlug: 'members', docs: [] }],
    ['no rows at all', { collectionSlug: 'members', docs: undefined }],
    [
      'a viewer known to lack moreska',
      { collectionSlug: 'members', docs: voditeljDocs, permissions: ticketAdmin },
    ],
  ])('stays hidden for %s', (_label, input) => {
    expect(inviteAllActionVisible(input)).toBe(false)
  })

  it('is satisfied by a single row carrying the flag, false included', () => {
    expect(
      inviteAllActionVisible({
        collectionSlug: 'members',
        docs: [{ id: 1 }, { id: 2, isMoreskant: false }],
      }),
    ).toBe(true)
  })

  it('treats an unreadable permission set as unknown, not as denied', () => {
    for (const permissions of [undefined, null, 'moreska', {}]) {
      expect(
        inviteAllActionVisible({ collectionSlug: 'members', docs: voditeljDocs, permissions }),
      ).toBe(true)
    }
  })
})
