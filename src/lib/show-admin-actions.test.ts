import { describe, it, expect } from 'vitest'
import {
  NON_PUBLIC_PERFORMANCE_MESSAGE,
  assertPublicPerformance,
  salesActionsVisible,
} from './show-admin-actions'

describe('salesActionsVisible', () => {
  it('shows the ticket actions on a saved public show', () => {
    expect(salesActionsVisible({ collectionSlug: 'shows', id: '7', isPublic: true })).toBe(true)
  })

  it('hides them on a non-public performance', () => {
    expect(salesActionsVisible({ collectionSlug: 'shows', id: '7', isPublic: false })).toBe(false)
  })

  it('treats a row that carries no isPublic value as public (the column defaults true)', () => {
    expect(salesActionsVisible({ collectionSlug: 'shows', id: '7' })).toBe(true)
  })

  it('hides them outside the shows collection', () => {
    expect(salesActionsVisible({ collectionSlug: 'orders', id: '7', isPublic: true })).toBe(false)
  })

  it('hides them on an unsaved document (no id yet)', () => {
    expect(salesActionsVisible({ collectionSlug: 'shows', id: null, isPublic: true })).toBe(false)
    expect(salesActionsVisible({ collectionSlug: 'shows', id: '', isPublic: true })).toBe(false)
    expect(salesActionsVisible({ collectionSlug: 'shows', isPublic: true })).toBe(false)
  })

  it('accepts a numeric id (Payload hands postgres ids as numbers)', () => {
    expect(salesActionsVisible({ collectionSlug: 'shows', id: 7, isPublic: true })).toBe(true)
  })
})

describe('assertPublicPerformance', () => {
  it('passes a public row through', () => {
    expect(() => assertPublicPerformance({ id: '7', isPublic: true })).not.toThrow()
    expect(() => assertPublicPerformance({ id: '7' })).not.toThrow()
  })

  it('throws the shared message on a non-public row', () => {
    expect(() => assertPublicPerformance({ id: '7', isPublic: false })).toThrow(
      NON_PUBLIC_PERFORMANCE_MESSAGE,
    )
  })

  it('never says "not found" so the routes still map it to a 400, not a 404', () => {
    expect(NON_PUBLIC_PERFORMANCE_MESSAGE).not.toMatch(/not found/i)
  })
})
