import { describe, expect, it } from 'vitest'
import {
  DARK_MEDIA_QUERY,
  THEME_ATTRIBUTE,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
  readThemePreference,
  resolveTheme,
} from './theme'

describe('readThemePreference', () => {
  it('keeps the three words it knows', () => {
    expect(readThemePreference('light')).toBe('light')
    expect(readThemePreference('dark')).toBe('dark')
    expect(readThemePreference('system')).toBe('system')
  })

  it('falls back to light rather than crashing on anything else (#633)', () => {
    expect(readThemePreference(null)).toBe('light')
    expect(readThemePreference(undefined)).toBe('light')
    expect(readThemePreference('')).toBe('light')
    expect(readThemePreference('nocturne')).toBe('light')
  })
})

describe('resolveTheme', () => {
  it('obeys an explicit choice whichever way the phone is set', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the phone for "Kao sustav"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('the no-flash boot script', () => {
  it('is built from the same constants the switch writes with', () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY)
    expect(THEME_BOOT_SCRIPT).toContain(THEME_ATTRIBUTE)
    expect(THEME_BOOT_SCRIPT).toContain(DARK_MEDIA_QUERY)
  })

  it('survives a browser that refuses storage, and closes no script tag', () => {
    expect(THEME_BOOT_SCRIPT).toContain('catch')
    expect(THEME_BOOT_SCRIPT).not.toContain('</script')
  })

  it('applies the stored choice to the body before anything renders', () => {
    const body = {
      attrs: {} as Record<string, string>,
      setAttribute(name: string, value: string) {
        this.attrs[name] = value
      },
    }
    const run = (stored: string | null, prefersDark: boolean) => {
      body.attrs = {}
      const scope = {
        localStorage: { getItem: () => stored },
        window: { matchMedia: () => ({ matches: prefersDark }) },
        document: { body },
      }
      // The script is plain ES5 and reads only these three globals.
      new Function(
        'localStorage',
        'window',
        'document',
        THEME_BOOT_SCRIPT,
      )(scope.localStorage, scope.window, scope.document)
      return body.attrs[THEME_ATTRIBUTE]
    }

    expect(run('dark', false)).toBe('dark')
    expect(run('light', true)).toBe('light')

    // The default, and the whole of #633: a phone set to dark that was never
    // told otherwise still opens Cecilija in light.
    expect(run(null, true)).toBe('light')
    expect(run(null, false)).toBe('light')
    expect(run('nonsense', true)).toBe('light')

    // ...and "Kao sustav", which is a CHOICE, still follows the phone.
    expect(run('system', true)).toBe('dark')
    expect(run('system', false)).toBe('light')
  })
})
