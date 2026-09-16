'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import {
  DARK_MEDIA_QUERY,
  ROOT_SCHEME_PROPERTY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
} from '@/lib/app/theme'
import { Segmented } from '../../ui'

// The dark switch (#569, Q21): three words, one attribute, one storage key.
//
// The rules are all in `lib/app/theme.ts`, shared with the inline boot script in
// the route group's layout. This component owns only the browser work the
// script cannot do twice: reading the key after hydration, writing it on a tap,
// and following the phone while "Kao sustav" is chosen.
//
// **It is an external store, not a piece of state.** The choice lives in this
// device's localStorage and the resolved skin also depends on the phone's own
// setting, so there are two sources outside React and neither of them belongs
// to this component: an effect that copied them into state would be a second
// copy of the truth, and the "Kao sustav" case would need a third to notice a
// phone flipping at sunset. `useSyncExternalStore` reads both, and the snapshot
// carries the CHOICE and the RESOLVED skin together — otherwise a sunset would
// move the skin without moving the snapshot, and nothing would re-render.
//
// **The server's snapshot is the default**, because the server cannot know what
// this device chose. That is not a flash: the skin was already right before
// React existed, put there by the boot script. The only thing that moves at
// hydration is which of the three words is highlighted.

const S = APP_STRINGS.theme

const ITEMS = [
  { key: 'light' as const, label: S.light },
  { key: 'dark' as const, label: S.dark },
  { key: 'system' as const, label: S.system },
]

/** Fired on a tap, so the store re-reads without waiting for a `storage` event
    (which a browser sends to every tab EXCEPT the one that wrote). */
const THEME_EVENT = 'cecilija:theme'

/**
 * The choice, for a browser that refuses storage.
 *
 * Without it a tap in a locked-down private window would write nothing, the
 * store would re-read the old value and the control would simply not move. The
 * skin then lasts as long as the page does, which is the honest most a browser
 * with no storage can offer.
 */
let remembered: ThemePreference | null = null

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_MEDIA_QUERY).matches
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_MEDIA_QUERY)
  media.addEventListener('change', onChange)
  window.addEventListener(THEME_EVENT, onChange)
  // Another tab of the same app, on a laptop: one choice per device, so both
  // windows follow it.
  window.addEventListener('storage', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener(THEME_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** "system|dark": one string, because both halves must move the render. */
function snapshot(): string {
  let stored: string | null = remembered
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY) ?? remembered
  } catch {
    // A private window with storage blocked: this page's memory, or the default.
  }
  const preference = readThemePreference(stored)
  return `${preference}|${resolveTheme(preference, prefersDark())}`
}

function serverSnapshot(): string {
  // The default, spelled the way `readThemePreference` spells it (#633): light,
  // chosen by nobody. The markup the server sends is the same either way, but
  // the highlighted word has to be the one the boot script is about to apply.
  return 'light|light'
}

export function ThemeSwitch() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const [preference, resolved] = snap.split('|') as [ThemePreference, 'light' | 'dark']

  // Two writes, the same word (#670). `.app` is the `<body>`, which is where
  // the tokens live; `color-scheme` on `<html>` is what Android reads before
  // deciding to repaint the page in its own dark theme, and a root that still
  // said "light" under the night skin would hand it a reason to. Both are the
  // boot script's writes, kept in step for the rest of the session.
  useEffect(() => {
    document.body.setAttribute(THEME_ATTRIBUTE, resolved)
    document.documentElement.style[ROOT_SCHEME_PROPERTY] = resolved
  }, [resolved])

  function pick(next: ThemePreference) {
    remembered = next
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Refused: `remembered` above is what carries the choice for this page.
    }
    window.dispatchEvent(new Event(THEME_EVENT))
  }

  return (
    <>
      <Segmented
        items={ITEMS}
        value={preference}
        onSelect={pick}
        mode="options"
        label={S.label}
        panelId="app-theme"
      />
      <p className="app__setting-note">{S.note}</p>
    </>
  )
}
