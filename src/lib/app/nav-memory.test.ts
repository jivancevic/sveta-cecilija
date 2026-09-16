import { describe, expect, it } from 'vitest'
import {
  canGoBack,
  NAV_DEPTH_KEY,
  nextDepth,
  readDepth,
  writeDepth,
  type NavStore,
} from './nav-memory'

/** A store that behaves, so the happy path is not the interesting one. */
function store(initial?: string): NavStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set(NAV_DEPTH_KEY, initial)
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

/** A browser that refuses storage outright — private mode, blocked site data. */
const refusing: NavStore = {
  getItem() {
    throw new Error('denied')
  },
  setItem() {
    throw new Error('denied')
  },
}

describe('nextDepth', () => {
  it('counts a push up and a pop back down', () => {
    expect(nextDepth(0, 'push')).toBe(1)
    expect(nextDepth(1, 'push')).toBe(2)
    expect(nextDepth(2, 'pop')).toBe(1)
    expect(nextDepth(1, 'pop')).toBe(0)
  })

  it('never goes below zero, so an uncounted pop cannot strand the reader', () => {
    // A hash change, a restored tab: `popstate` fires for steps we never saw.
    expect(nextDepth(0, 'pop')).toBe(0)
    expect(nextDepth(-5, 'pop')).toBe(0)
  })

  it('treats nonsense as the start', () => {
    expect(nextDepth(Number.NaN, 'push')).toBe(1)
    expect(nextDepth(Number.POSITIVE_INFINITY, 'pop')).toBe(0)
    expect(nextDepth(2.7, 'push')).toBe(3)
  })
})

describe('readDepth', () => {
  it('reads what was written', () => {
    expect(readDepth(store('3'))).toBe(3)
  })

  it('reads an empty slot as the start', () => {
    expect(readDepth(store())).toBe(0)
  })

  it('reads rubbish as the start rather than throwing', () => {
    expect(readDepth(store('later'))).toBe(0)
    expect(readDepth(store('-2'))).toBe(0)
    expect(readDepth(store(''))).toBe(0)
  })

  it('survives a browser that throws on access', () => {
    expect(readDepth(refusing)).toBe(0)
    expect(readDepth(null)).toBe(0)
  })
})

describe('writeDepth', () => {
  it('records a depth', () => {
    const s = store()
    writeDepth(s, 2)
    expect(s.map.get(NAV_DEPTH_KEY)).toBe('2')
  })

  it('records zero, because "no way back" is an answer', () => {
    const s = store('4')
    writeDepth(s, 0)
    expect(s.map.get(NAV_DEPTH_KEY)).toBe('0')
  })

  it('refuses to record nonsense', () => {
    const s = store('1')
    writeDepth(s, Number.NaN)
    writeDepth(s, -3)
    expect(s.map.get(NAV_DEPTH_KEY)).toBe('1')
  })

  it('swallows a refusing storage', () => {
    expect(() => writeDepth(refusing, 1)).not.toThrow()
    expect(() => writeDepth(null, 1)).not.toThrow()
  })
})

describe('canGoBack', () => {
  it('is false on the screen a notification opened', () => {
    // The whole point: `history.back()` there leaves Cecilija.
    expect(canGoBack(0)).toBe(false)
  })

  it('is true once the reader has moved inside the app', () => {
    expect(canGoBack(1)).toBe(true)
    expect(canGoBack(9)).toBe(true)
  })

  it('is false for nonsense', () => {
    expect(canGoBack(Number.NaN)).toBe(false)
    expect(canGoBack(-1)).toBe(false)
  })
})

describe('a whole visit', () => {
  it('opens deep, walks in and back out again', () => {
    const s = store()
    // A push notification lands on one nastup: nothing of ours behind.
    expect(canGoBack(readDepth(s))).toBe(false)

    // The reader taps through to the roster, then into a member.
    writeDepth(s, nextDepth(readDepth(s), 'push'))
    writeDepth(s, nextDepth(readDepth(s), 'push'))
    expect(canGoBack(readDepth(s))).toBe(true)

    // Back, back — and they are on the screen the notification opened, where
    // the control has to be a link again.
    writeDepth(s, nextDepth(readDepth(s), 'pop'))
    writeDepth(s, nextDepth(readDepth(s), 'pop'))
    expect(canGoBack(readDepth(s))).toBe(false)
  })
})
