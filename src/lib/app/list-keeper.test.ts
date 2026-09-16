import { describe, expect, it } from 'vitest'
import { keepsList, keepsListAs, listKeeperIds, type ListKeeperActor } from './list-keeper'

const voditelj = (): ListKeeperActor => ({
  user: { permissions: ['moreska'] },
  memberId: null,
})
const dancer = (memberId: string | null = '7'): ListKeeperActor => ({
  user: { permissions: ['moreskant'] },
  memberId,
})

const row = (listKeepers: unknown) => ({ listKeepers })

describe('listKeeperIds', () => {
  it('reads bare ids, populated docs and a mix of both', () => {
    expect(listKeeperIds(row([7, { id: 9 }, '11']))).toEqual(['7', '9', '11'])
  })

  it('is empty for an absent, null or non-array field', () => {
    expect(listKeeperIds(row(undefined))).toEqual([])
    expect(listKeeperIds(row(null))).toEqual([])
    expect(listKeeperIds(row('7'))).toEqual([])
    expect(listKeeperIds(null)).toEqual([])
  })

  it('drops a value that carries no id at all', () => {
    expect(listKeeperIds(row([{ name: 'Ante' }, 7]))).toEqual(['7'])
  })
})

describe('keepsList — the voditelj', () => {
  it('keeps every list, named on the row or not', () => {
    expect(keepsList(voditelj(), row([]))).toBe(true)
    expect(keepsList(voditelj(), row([99]))).toBe(true)
  })

  it('keeps it without a Member link of their own', () => {
    expect(keepsList({ user: { permissions: ['moreska'] }, memberId: null }, row([]))).toBe(true)
  })
})

describe('keepsList — the zaduženi', () => {
  it('keeps the list of the evening that names them', () => {
    expect(keepsList(dancer('7'), row([7]))).toBe(true)
    expect(keepsList(dancer('7'), row([{ id: 7 }]))).toBe(true)
  })

  it('compares ids across types, because Postgres hands back numbers', () => {
    expect(keepsList(dancer('7'), row(['7']))).toBe(true)
  })

  it('keeps nothing on an evening that names somebody else', () => {
    expect(keepsList(dancer('7'), row([8, 9]))).toBe(false)
  })

  it('keeps nothing on an evening that names nobody', () => {
    expect(keepsList(dancer('7'), row([]))).toBe(false)
    expect(keepsList(dancer('7'), row(undefined))).toBe(false)
  })

  it('keeps nothing without a live Member link: an inactive dancer resolves to null', () => {
    expect(keepsList(dancer(null), row([7]))).toBe(false)
  })
})

describe('keepsList — everybody else', () => {
  it('refuses a login that holds neither word, even when the row names its member', () => {
    expect(keepsList({ user: { permissions: ['tickets'] }, memberId: '7' }, row([7]))).toBe(false)
    expect(keepsList({ user: { permissions: [] }, memberId: '7' }, row([7]))).toBe(false)
    expect(keepsList({ user: null, memberId: '7' }, row([7]))).toBe(false)
  })

  it('refuses when there is no evening to keep a list of', () => {
    expect(keepsList(voditelj(), null)).toBe(false)
    expect(keepsList(dancer('7'), undefined)).toBe(false)
  })
})

describe('keepsListAs — the loader half', () => {
  it('reaches the same verdict as the route half, case for case', () => {
    const cases: Array<[ListKeeperActor, unknown]> = [
      [voditelj(), []],
      [voditelj(), [99]],
      [dancer('7'), [7]],
      [dancer('7'), [8]],
      [dancer('7'), []],
      [dancer(null), [7]],
    ]
    for (const [actor, keepers] of cases) {
      const permissions = (actor.user?.permissions ?? []) as string[]
      const viewer = { voditelj: permissions.includes('moreska'), memberId: actor.memberId }
      expect(keepsListAs(viewer, row(keepers))).toBe(keepsList(actor, row(keepers)))
    }
  })

  it('refuses a viewer with no Member on an evening that names somebody', () => {
    expect(keepsListAs({ voditelj: false, memberId: null }, row([7]))).toBe(false)
  })

  it('refuses when there is no evening', () => {
    expect(keepsListAs({ voditelj: true, memberId: null }, null)).toBe(false)
  })
})
