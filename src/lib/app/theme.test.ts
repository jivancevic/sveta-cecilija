import { describe, expect, it } from 'vitest'
import {
  DARK_MEDIA_QUERY,
  THEME_ATTRIBUTE,
  ROOT_SCHEME_STYLE_KEY,
  rootColorScheme,
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
    expect(THEME_BOOT_SCRIPT).toContain(ROOT_SCHEME_STYLE_KEY)
  })

  it('survives a browser that refuses storage, and closes no script tag', () => {
    expect(THEME_BOOT_SCRIPT).toContain('catch')
    expect(THEME_BOOT_SCRIPT).not.toContain('</script')
  })

  it('applies the stored choice to the body before anything renders', () => {
    const run = (stored: string | null, prefersDark: boolean) => boot(stored, prefersDark).theme

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

  // #670. Android decides whether to repaint a page in its own dark theme by
  // reading `color-scheme` off the ROOT element. Cecilija declared it on `.app`
  // — the body — so the document never called itself light and Chrome inverted
  // it: the switch on Profil read "Svijetla" while the screen stayed dark, and
  // no choice in it could change that, because the darkness was not ours.
  it('tells the ROOT which scheme it is, so Android stops repainting us', () => {
    expect(boot(null, true).root).toBe('only light')
    expect(boot('light', true).root).toBe('only light')
    expect(boot('dark', false).root).toBe('only dark')
    expect(boot('system', true).root).toBe('only dark')
    expect(boot('system', false).root).toBe('only light')
  })

  // The word `only` is the fix, not decoration: Chrome documents `only light`
  // as the opt-out from Auto Dark Theme, and a bare `light` states which scheme
  // the page uses without refusing the repaint.
  it('refuses the repaint rather than merely naming the skin', () => {
    for (const stored of [null, 'light', 'dark', 'system', 'nonsense']) {
      for (const prefersDark of [true, false]) {
        const out = boot(stored, prefersDark)
        expect(out.root).toBe(`only ${out.theme}`)
        expect(out.root).toBe(rootColorScheme(out.theme as 'light' | 'dark'))
      }
    }
  })
})

/**
 * Runs the boot script against the three globals it reads, and reports what it
 * wrote in both places: the body's attribute (the tokens) and the root's
 * inline `color-scheme` (what Android reads before deciding to repaint us).
 */
function boot(stored: string | null, prefersDark: boolean) {
  const attrs: Record<string, string> = {}
  const style: Record<string, string> = {}
  const document = {
    body: {
      setAttribute(name: string, value: string) {
        attrs[name] = value
      },
    },
    documentElement: { style },
  }
  // The script is plain ES5 and reads only these three globals.
  new Function(
    'localStorage',
    'window',
    'document',
    THEME_BOOT_SCRIPT,
  )({ getItem: () => stored }, { matchMedia: () => ({ matches: prefersDark }) }, document)
  return { theme: attrs[THEME_ATTRIBUTE], root: style.colorScheme }
}
