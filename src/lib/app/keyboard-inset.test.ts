import { describe, expect, it } from 'vitest'
import { KEYBOARD_MIN_PX, keyboardInset, keyboardIsOpen } from './keyboard-inset'

describe('keyboardInset', () => {
  it('is zero on a screen with no keyboard', () => {
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 844, offsetTop: 0 })).toBe(0)
  })

  it('measures a keyboard that shrank the visual viewport', () => {
    // An iPhone 14, Croatian keyboard up: 844 − 508 = 336.
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 508, offsetTop: 0 })).toBe(336)
  })

  it('measures a keyboard that pushed the visual viewport down instead', () => {
    // iOS scrolls the focused field into view rather than resizing, and then
    // the gap is entirely in `offsetTop`.
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 508, offsetTop: 120 })).toBe(216)
  })

  it('ignores a collapsing address bar', () => {
    // The fault this threshold exists for: a browser toolbar parts the two
    // viewports by forty or fifty pixels on every scroll, and treating that as
    // a keyboard would slide the tab bar out from under a reader's thumb.
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 800, offsetTop: 0 })).toBe(0)
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 844 - 79, offsetTop: 0 })).toBe(0)
  })

  it('takes the threshold itself as a keyboard', () => {
    const geometry = { innerHeight: 844, viewportHeight: 844 - KEYBOARD_MIN_PX, offsetTop: 0 }
    expect(keyboardInset(geometry)).toBe(KEYBOARD_MIN_PX)
  })

  it('rounds, because a CSS pixel is not a fraction anybody can see', () => {
    expect(keyboardInset({ innerHeight: 844.4, viewportHeight: 508.1, offsetTop: 0 })).toBe(336)
  })

  it('reads a negative gap as no keyboard', () => {
    // Mid-pinch a browser can report a visual viewport taller than its layout
    // one. Nothing should move for that.
    expect(keyboardInset({ innerHeight: 508, viewportHeight: 844, offsetTop: 0 })).toBe(0)
  })

  it('refuses a gap taller than the screen', () => {
    // A sheet pushed off the top of the page is a sheet the reader cannot close.
    expect(keyboardInset({ innerHeight: 844, viewportHeight: -100, offsetTop: 0 })).toBe(0)
  })

  it('reads nonsense and nothing at all as no keyboard', () => {
    expect(keyboardInset(null)).toBe(0)
    expect(keyboardInset(undefined)).toBe(0)
    expect(
      keyboardInset({ innerHeight: Number.NaN, viewportHeight: 508, offsetTop: 0 }),
    ).toBe(0)
    expect(
      keyboardInset({ innerHeight: 844, viewportHeight: 508, offsetTop: Number.NaN }),
    ).toBe(0)
    expect(
      keyboardInset({
        innerHeight: Number.POSITIVE_INFINITY,
        viewportHeight: 508,
        offsetTop: 0,
      }),
    ).toBe(0)
  })
})

describe('keyboardIsOpen', () => {
  it('is what the tab bar hides on', () => {
    expect(keyboardIsOpen(336)).toBe(true)
    expect(keyboardIsOpen(0)).toBe(false)
    expect(keyboardIsOpen(Number.NaN)).toBe(false)
  })
})
