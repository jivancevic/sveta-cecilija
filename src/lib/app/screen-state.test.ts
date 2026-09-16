import { describe, expect, it } from 'vitest'
import {
  firstValue,
  flagValue,
  nextHref,
  nextSearch,
  readFlag,
  readFlagParam,
  readOneOf,
  readOneOfParam,
  readText,
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
    expect(readText(nextSearch('', { q: 'Ćiro & Đani' }), 'q')).toBe('Ćiro & Đani')
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

describe('nextHref', () => {
  it('joins the path to the new address', () => {
    expect(nextHref('/app/members', '', { f: 'no-app' })).toBe('/app/members?f=no-app')
  })

  it('gives a bare path when nothing is set', () => {
    expect(nextHref('/app/members', '?f=no-app', { f: null })).toBe('/app/members')
  })
})

describe('readText', () => {
  it('reads a value', () => {
    expect(readText('?q=ana', 'q')).toBe('ana')
  })

  it('reads a missing key, an empty address and nothing at all as empty', () => {
    expect(readText('?f=all', 'q')).toBe('')
    expect(readText('', 'q')).toBe('')
    expect(readText(null, 'q')).toBe('')
    expect(readText(undefined, 'q')).toBe('')
  })

  it('trims, so a space in the address does not hide every row', () => {
    expect(readText('?q=%20%20', 'q')).toBe('')
    expect(readText('?q=%20ana%20', 'q')).toBe('ana')
  })
})

describe('readOneOf', () => {
  const chips = ['all', 'no-app', 'no-push', 'no-access'] as const

  it('reads a word from the set', () => {
    expect(readOneOf('?f=no-app', 'f', chips, 'all')).toBe('no-app')
  })

  it('falls back rather than failing on a word that is not in the set', () => {
    // An address outlives the chip that wrote it; a renamed chip must not turn
    // a roster screen into an error.
    expect(readOneOf('?f=bez-appa', 'f', chips, 'all')).toBe('all')
    expect(readOneOf('', 'f', chips, 'all')).toBe('all')
  })
})

describe('readFlag and flagValue', () => {
  it('reads one as open and everything else as closed', () => {
    expect(readFlag('?past=1', 'past')).toBe(true)
    expect(readFlag('?past=0', 'past')).toBe(false)
    expect(readFlag('?past=true', 'past')).toBe(false)
    expect(readFlag('', 'past')).toBe(false)
  })

  it('writes only the open state, so a closed harmonica leaves no trace', () => {
    expect(flagValue(true)).toBe('1')
    expect(flagValue(false)).toBe(null)
    expect(nextSearch('?past=1', { past: flagValue(false) })).toBe('')
  })

  it('round-trips', () => {
    expect(readFlag(nextSearch('', { past: flagValue(true) }), 'past')).toBe(true)
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

  it('trims', () => {
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
    expect(readOneOfParam({ f: 'nonsense' }, 'f', chips, 'all')).toBe('all')
    expect(readOneOfParam({}, 'f', chips, 'all')).toBe('all')
  })
})
