import { describe, expect, it } from 'vitest'
import { selectBulkInvites, summariseBulkInvites, type BulkMember } from './invite-all'
import { APP_STRINGS } from './strings'

const dancer = (over: Partial<BulkMember> & { id: string | number }): BulkMember => ({
  email: 'cici@example.com',
  isMoreskant: true,
  active: true,
  ...over,
})

describe('selectBulkInvites', () => {
  it('invites the active dancers with an e-mail and no login', () => {
    const out = selectBulkInvites([dancer({ id: 1 }), dancer({ id: 2 })], new Set())
    expect(out).toEqual({ send: ['1', '2'], noEmail: [] })
  })

  it('skips anyone who already has a login, silently', () => {
    const out = selectBulkInvites([dancer({ id: 1 }), dancer({ id: 2 })], new Set(['1']))
    expect(out).toEqual({ send: ['2'], noEmail: [] })
  })

  it('counts an eligible dancer with no e-mail rather than hiding them', () => {
    const out = selectBulkInvites(
      [dancer({ id: 1, email: null }), dancer({ id: 2, email: '   ' }), dancer({ id: 3 })],
      new Set(),
    )
    expect(out).toEqual({ send: ['3'], noEmail: ['1', '2'] })
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
    expect(out).toEqual({ send: ['4'], noEmail: [] })
  })

  it('treats a missing `active` as active: the column defaults to true', () => {
    expect(selectBulkInvites([dancer({ id: 9, active: undefined })], new Set()).send).toEqual(['9'])
  })

  it('ignores a row with no id', () => {
    const out = selectBulkInvites([{ id: null as unknown as number }, dancer({ id: 4 })], new Set())
    expect(out.send).toEqual(['4'])
  })

  it('does not report a login-holder who has no e-mail', () => {
    const out = selectBulkInvites([dancer({ id: 1, email: null })], new Set(['1']))
    expect(out).toEqual({ send: [], noEmail: [] })
  })
})

describe('summariseBulkInvites', () => {
  it('says the good ending in its own words, never "poslano: 0"', () => {
    expect(summariseBulkInvites({ sent: 0, noEmail: 0, failed: 0 })).toBe(
      APP_STRINGS.inviteAll.none,
    )
  })

  it('reports only what happened', () => {
    expect(summariseBulkInvites({ sent: 3, noEmail: 0, failed: 0 })).toBe(
      APP_STRINGS.inviteAll.sent(3),
    )
  })

  it('names the dancers with no e-mail alongside the successes', () => {
    const message = summariseBulkInvites({ sent: 9, noEmail: 3, failed: 0 })
    expect(message).toContain(APP_STRINGS.inviteAll.sent(9))
    expect(message).toContain(APP_STRINGS.inviteAll.noEmail(3))
  })

  it('reports failures too', () => {
    const message = summariseBulkInvites({ sent: 1, noEmail: 1, failed: 2 })
    expect(message).toBe(
      [
        APP_STRINGS.inviteAll.sent(1),
        APP_STRINGS.inviteAll.noEmail(1),
        APP_STRINGS.inviteAll.failed(2),
      ].join(' '),
    )
  })
})
