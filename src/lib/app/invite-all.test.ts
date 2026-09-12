import { describe, expect, it } from 'vitest'
import {
  bulkLabel,
  nameList,
  selectBulkInvites,
  summariseBulkInvites,
  type BulkMember,
} from './invite-all'
import { APP_STRINGS } from './strings'

const dancer = (over: Partial<BulkMember> & { id: string | number }): BulkMember => ({
  name: 'Ivan Fabris',
  nickname: 'Cici',
  email: 'cici@example.com',
  isMoreskant: true,
  active: true,
  ...over,
})

/** The ids of a selection half, for the tests that only care about who. */
const ids = (targets: readonly { id: string }[]) => targets.map((t) => t.id)

describe('bulkLabel', () => {
  it('prefers the nickname, the name a voditelj actually uses', () => {
    expect(bulkLabel(dancer({ id: 1 }))).toBe('Cici')
  })

  it('falls back to the name, then to the id, so a row is always addressable', () => {
    expect(bulkLabel(dancer({ id: 1, nickname: '  ' }))).toBe('Ivan Fabris')
    expect(bulkLabel(dancer({ id: 7, nickname: null, name: null }))).toBe('7')
  })
})

describe('selectBulkInvites', () => {
  it('invites the active dancers with an e-mail and no login', () => {
    const out = selectBulkInvites([dancer({ id: 1 }), dancer({ id: 2 })], new Set())
    expect(ids(out.send)).toEqual(['1', '2'])
    expect(out.noEmail).toEqual([])
  })

  it('carries a label for every target', () => {
    const out = selectBulkInvites([dancer({ id: 1, nickname: 'Bepo' })], new Set())
    expect(out.send).toEqual([{ id: '1', label: 'Bepo' }])
  })

  it('skips anyone who already has a login, silently', () => {
    const out = selectBulkInvites([dancer({ id: 1 }), dancer({ id: 2 })], new Set(['1']))
    expect(ids(out.send)).toEqual(['2'])
    expect(out.noEmail).toEqual([])
  })

  it('names an eligible dancer with no e-mail rather than hiding them', () => {
    const out = selectBulkInvites(
      [
        dancer({ id: 1, nickname: 'Mare', email: null }),
        dancer({ id: 2, nickname: 'Dado', email: '   ' }),
        dancer({ id: 3 }),
      ],
      new Set(),
    )
    expect(ids(out.send)).toEqual(['3'])
    expect(out.noEmail.map((t) => t.label)).toEqual(['Mare', 'Dado'])
  })

  it('leaves out non-dancers and retired members entirely', () => {
    const out = selectBulkInvites(
      [
        dancer({ id: 1, isMoreskant: false }),
        dancer({ id: 2, active: false }),
        dancer({ id: 3, isMoreskant: undefined }),
        dancer({ id: 4 }),
      ],
      new Set(),
    )
    expect(ids(out.send)).toEqual(['4'])
    expect(out.noEmail).toEqual([])
  })

  it('treats a missing `active` as active: the column defaults to true', () => {
    expect(ids(selectBulkInvites([dancer({ id: 9, active: undefined })], new Set()).send)).toEqual([
      '9',
    ])
  })

  it('ignores a row with no id', () => {
    const out = selectBulkInvites([{ id: null as unknown as number }, dancer({ id: 4 })], new Set())
    expect(ids(out.send)).toEqual(['4'])
  })

  it('does not report a login-holder who has no e-mail', () => {
    const out = selectBulkInvites([dancer({ id: 1, email: null })], new Set(['1']))
    expect(out).toEqual({ send: [], noEmail: [] })
  })
})

describe('nameList', () => {
  it('lists everyone while the list is short', () => {
    expect(nameList(['Cici', 'Bepo'])).toBe('Cici, Bepo')
  })

  it('truncates so a toast stays a toast', () => {
    expect(nameList(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(
      `a, b, c, d ${APP_STRINGS.inviteAll.andMore(2)}`,
    )
  })
})

describe('summariseBulkInvites', () => {
  it('says the good ending in its own words, never "poslano: 0"', () => {
    expect(summariseBulkInvites({ sent: 0, noEmail: [], failed: [] })).toBe(
      APP_STRINGS.inviteAll.none,
    )
  })

  it('reports only what happened', () => {
    expect(summariseBulkInvites({ sent: 3, noEmail: [], failed: [] })).toBe(
      APP_STRINGS.inviteAll.sent(3),
    )
  })

  it('names the dancers with no e-mail alongside the successes', () => {
    const message = summariseBulkInvites({ sent: 9, noEmail: ['Mare', 'Dado'], failed: [] })
    expect(message).toContain(APP_STRINGS.inviteAll.sent(9))
    expect(message).toContain('Mare, Dado')
  })

  /**
   * The one that matters: a failed send leaves a login behind, so the next bulk
   * press skips that dancer forever. The names are what sends a voditelj to the
   * per-row action, which does re-mail them.
   */
  it('names the dancers the send failed for', () => {
    expect(summariseBulkInvites({ sent: 0, noEmail: [], failed: ['Bepo', 'Mare'] })).toBe(
      APP_STRINGS.inviteAll.failed('Bepo, Mare'),
    )
  })

  it('reports all three outcomes in order', () => {
    expect(summariseBulkInvites({ sent: 1, noEmail: ['Mare'], failed: ['Bepo'] })).toBe(
      [
        APP_STRINGS.inviteAll.sent(1),
        APP_STRINGS.inviteAll.noEmail('Mare'),
        APP_STRINGS.inviteAll.failed('Bepo'),
      ].join(' '),
    )
  })
})
