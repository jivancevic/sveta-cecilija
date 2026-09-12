'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  detectPlatform,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_KEY,
  SNOOZE_KEY,
  SNOOZE_MS,
  type AppPlatform,
} from '@/lib/app/platform'

// The browser half of the install flow (#455): the facts `platform.ts` decides
// over, read here and nowhere else.
//
// Every storage and capability access is wrapped, the rule the banner has
// followed since #421: a private window, a browser set to block site data and a
// thumbnail-capture pass can each throw, and none of that may take `/app` down.

/** Chromium's install event. Not in lib.dom, so declared where it is used. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function standalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

/** This browser's platform, read from the browser and decided in `platform.ts`. */
export function readPlatform(): AppPlatform {
  return detectPlatform({
    userAgent: navigator.userAgent,
    standalone: standalone(),
    touchPoints: navigator.maxTouchPoints ?? 0,
  })
}

/**
 * The platform as a render-time fact, `null` until the browser exists.
 *
 * `useSyncExternalStore` rather than an effect: the platform is an external
 * fact this component only reads, the server snapshot is honestly "not known
 * yet", and the snapshot is a plain string so there is nothing to memoize. The
 * store never changes under us, hence the no-op subscribe; the one thing that
 * DOES change it, a completed install, is the caller's own state.
 */
const noSubscription = () => () => {}
const noServerSnapshot = () => null

export function usePlatform(): AppPlatform | null {
  return useSyncExternalStore(noSubscription, readPlatform, noServerSnapshot)
}

/**
 * Whether the phone behind a webview is an iPhone, for the "get out of here"
 * instruction. Not `detectPlatform`, which has already answered `inapp` and is
 * right to: this is a second, narrower question about the same UA.
 */
export function webviewHostIsIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isSnoozed(now = Date.now()): boolean {
  try {
    const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? '0')
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

/**
 * "Kasnije" means tomorrow, not never (#455).
 *
 * The old banner wrote a permanent flag, so one × on an iPhone silenced both
 * the install hint and, with it, the only route to notifications on that
 * device. A timestamp costs the same and forgets on its own.
 */
export function snooze(now = Date.now()): void {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS))
  } catch {
    // Not remembered this time; the banner simply comes back sooner.
  }
}

/**
 * The `beforeinstallprompt` event the layout script parked on `window`.
 *
 * `install()` resolves true when the browser reports the app was accepted. A
 * prompt can only be used once, so the event is dropped either way.
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const read = () => {
      const parked = (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_KEY]
      setEvent((parked as BeforeInstallPromptEvent) ?? null)
    }
    read()
    window.addEventListener(INSTALL_PROMPT_EVENT, read)
    return () => window.removeEventListener(INSTALL_PROMPT_EVENT, read)
  }, [])

  const install = useCallback(async (): Promise<boolean> => {
    if (!event) return false
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      return outcome === 'accepted'
    } catch {
      return false
    } finally {
      try {
        delete (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_KEY]
      } catch {
        // Leaving it parked only means one dead button until the next load.
      }
      setEvent(null)
    }
  }, [event])

  return { canPrompt: event !== null, install }
}
