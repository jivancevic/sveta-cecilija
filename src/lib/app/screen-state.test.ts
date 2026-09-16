import { describe, expect, it } from 'vitest'
import {
  firstValue,
  flagValue,
  nextSearch,
  readFlagParam,
  readOneOfParam,
} from './screen-state'

describe('nextSearch', () => {
  it('sets a value on an empty address', () => {
    expect(nextSearch('', { q: 'ana' })).toBe('?q=ana')
  })

  it('accepts an address with or without the question mark', () => {
    expect(nextSearch('?q=ana', { f: 'no-app' })).toBe('?q=ana&f=no-app')
    expect(nextSearch('q=ana', { f: 'no-app' })).toBe('?q=ana&f=no-app')
  })

  it('keeps an existing key where it already was', () => {
    // Otherwise the address bar reshuffles itself on every keystroke.
    expect(nextSearch('?q=ana&f=no-app', { q: 'ant' })).toBe('?q=ant&f=no-app')
  })

  it('takes a key out when the value is empty, null or undefined', () => {
    expect(nextSearch('?q=ana&f=no-app', { q: '' })).toBe('?f=no-app')
    expect(nextSearch('?q=ana&f=no-app', { f: null })).toBe('?q=ana')
    expect(nextSearch('?q=ana', { q: undefined })).toBe('')
  })

  it('returns a bare address when nothing is left', () => {
    // A cleared filter and a freshly tapped tab must land in the same place.
    expect(nextSearch('?q=ana', { q: '' })).toBe('')
    expect(nextSearch('', { q: null })).toBe('')
  })

  it('treats whitespace as empty', () => {
    expect(nextSearch('?q=ana', { q: '   ' })).toBe('')
  })

  it('trims what it keeps', () => {
    expect(nextSearch('', { q: '  ana  ' })).toBe('?q=ana')
  })

  it('escapes what a Croatian roster actually types', () => {
    expect(nextSearch('', { q: 'Ćiro & Đani' })).toBe('?q=%C4%86iro+%26+%C4%90ani')
    // And comes back out the way it went in, through the browser's own parser,
    // which is what the screen reads it with.
    expect(new URLSearchParams(nextSearch('', { q: 'Ćiro & Đani' })).get('q')).toBe('Ćiro & Đani')
  })

  it('applies several changes at once', () => {
    expect(nextSearch('?q=ana&f=no-app&page=3', { q: 'x', f: null, page: '1' })).toBe(
      '?q=x&page=1',
    )
  })

  it('leaves parameters it was not asked about alone', () => {
    // Narudžbe carries a show and a state filter beside its search.
    expect(nextSearch('?show=12&state=paid&q=a', { q: 'b' })).toBe('?show=12&state=paid&q=b')
  })
})

describe('flagValue', () => {
  it('writes only the open state, so a closed harmonica leaves no trace', () => {
    expect(flagValue(true)).toBe('1')
    expect(flagValue(false)).toBe(null)
    expect(nextSearch('?past=1', { past: flagValue(false) })).toBe('')
  })

  it('round-trips through the address', () => {
    expect(new URLSearchParams(nextSearch('', { past: flagValue(true) })).get('past')).toBe('1')
  })
})

describe('what a server component is handed', () => {
  it('reads a plain value', () => {
    expect(firstValue({ q: 'ana' }, 'q')).toBe('ana')
    expect(firstValue({}, 'q')).toBe('')
    expect(firstValue({ q: undefined }, 'q')).toBe('')
  })

  it('takes the first of a doubled key', () => {
    // `?past=1&past=0` is not something a screen means; it is what a pasted
    // link produces, and the first value is the one that was typed.
    expect(firstValue({ past: ['1', '0'] }, 'past')).toBe('1')
    expect(firstValue({ past: [] }, 'past')).toBe('')
  })

  it('trims, so a space in the address does not hide every row', () => {
    expect(firstValue({ q: '  ana ' }, 'q')).toBe('ana')
  })

  it('reads a flag', () => {
    expect(readFlagParam({ past: '1' }, 'past')).toBe(true)
    expect(readFlagParam({ past: ['1'] }, 'past')).toBe(true)
    expect(readFlagParam({ past: 'yes' }, 'past')).toBe(false)
    expect(readFlagParam({}, 'past')).toBe(false)
  })

  it('reads one word out of a set, falling back on anything else', () => {
    const chips = ['all', 'no-app'] as const
    expect(readOneOfParam({ f: 'no-app' }, 'f', chips, 'all')).toBe('no-app')
    // An address outlives the chip that wrote it; a renamed chip must not turn
    // a list screen into an error.
    expect(readOneOfParam({ f: 'nonsense' }, 'f', chips, 'all')).toBe('all')
    expect(readOneOfParam({}, 'f', chips, 'all')).toBe('all')
  })
})
