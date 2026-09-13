import { describe, expect, it } from 'vitest'
import { recallScroll, rememberScroll, scrollKey, type ScrollStore } from './scroll-memory'

// Where a list was when you left it (#562 review, finding 2).

function memoryStore(): ScrollStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

/** A browser that refuses to store anything, which some of them do. */
const refusingStore: ScrollStore = {
  getItem() {
    throw new Error('denied')
  },
  setItem() {
    throw new Error('denied')
  },
}

describe('scrollKey', () => {
  it('prefers the history entry’s own key, so two visits do not share a slot', () => {
    expect(scrollKey({ key: 'abc123' }, 'https://x/app/orders')).toBe('cecilija:scroll:abc123')
  })

  it('falls back to the path when the router carries no key', () => {
    expect(scrollKey(null, 'https://x/app/orders?page=2')).toBe(
      'cecilija:scroll:https://x/app/orders?page=2',
    )
    expect(scrollKey({}, '/app/orders')).toBe('cecilija:scroll:/app/orders')
  })

  it('drops the hash: an anchor is its own position', () => {
    expect(scrollKey(null, '/app/orders#row-4')).toBe('cecilija:scroll:/app/orders')
  })

  it('ignores a key that is not a usable string', () => {
    expect(scrollKey({ key: 42 }, '/app/x')).toBe('cecilija:scroll:/app/x')
    expect(scrollKey({ key: '' }, '/app/x')).toBe('cecilija:scroll:/app/x')
  })
})

describe('rememberScroll / recallScroll', () => {
  it('round-trips a position', () => {
    const store = memoryStore()
    rememberScroll(store, 'k', 840.6)
    expect(recallScroll(store, 'k')).toBe(841)
  })

  it('records the top, because "the top" is an answer', () => {
    const store = memoryStore()
    rememberScroll(store, 'k', 0)
    expect(recallScroll(store, 'k')).toBe(0)
  })

  it('has nothing to say about a slot it never wrote', () => {
    expect(recallScroll(memoryStore(), 'k')).toBeNull()
  })

  it('refuses a nonsense position rather than storing it', () => {
    const store = memoryStore()
    rememberScroll(store, 'k', Number.NaN)
    rememberScroll(store, 'k', -10)
    expect(store.map.size).toBe(0)
  })

  it('reads back nothing from a corrupted slot', () => {
    const store = memoryStore()
    store.map.set('k', 'not a number')
    expect(recallScroll(store, 'k')).toBeNull()
  })

  it('survives a browser that refuses to store anything', () => {
    expect(() => rememberScroll(refusingStore, 'k', 100)).not.toThrow()
    expect(recallScroll(refusingStore, 'k')).toBeNull()
  })

  it('does nothing at all without a store', () => {
    expect(() => rememberScroll(null, 'k', 100)).not.toThrow()
    expect(recallScroll(null, 'k')).toBeNull()
  })
})
