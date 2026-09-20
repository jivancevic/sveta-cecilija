'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  androidInstaller,
  detectPlatform,
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_KEY,
  REINSTALL_SNOOZE_KEY,
  REINSTALL_SNOOZE_MS,
  SNOOZE_KEY,
  SNOOZE_MS,
  type AndroidInstaller,
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

/**
 * Re-exported, not re-implemented (#457): `push-client.ts` owns every browser
 * push call, so "can this browser subscribe at all" has ONE answer. The banner
 * reads it from here because that is where the rest of its facts live.
 */
export { notificationPermission, pushSupported } from './push-client'
import { hasPushSubscription, notificationPermission, pushSupported } from './push-client'

/**
 * Is this browser running as an installed app?
 *
 * Exported because #652 sends it to the server: `SessionKeeper` reports it on
 * the throttled heartbeat, and this is the one place in the app that knows how
 * to ask (Chromium answers the media query, iOS answers `navigator.standalone`
 * and nothing else). Re-reading it beside the fetch would be a second, subtly
 * different definition of "installed".
 */
export function readStandalone(): boolean {
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
    standalone: readStandalone(),
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

/** Which install route built this browser's app, from its UA (#684). */
export function readInstaller(): AndroidInstaller {
  return androidInstaller(navigator.userAgent)
}

/**
 * The installer as a render-time fact, `null` until the browser exists.
 *
 * `usePlatform`'s twin, and read the same way for the same reason: an
 * installed app keeps reporting the UA of the browser that built it, so this
 * is a fact of the browser that never changes under us, and the honest server
 * snapshot is "not known yet" rather than a guess at Chrome.
 */
export function useInstaller(): AndroidInstaller | null {
  return useSyncExternalStore(noSubscription, readInstaller, noServerSnapshot)
}

/**
 * Whether the phone behind a webview is an iPhone, for the "get out of here"
 * instruction. Not `detectPlatform`, which has already answered `inapp` and is
 * right to: this is a second, narrower question about the same UA.
 */
export function webviewHostIsIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Is a "Kasnije" still in force under this key?
 *
 * Keyed rather than fixed since #684: there are two cards that can be put off
 * and they must not silence each other (`platform.ts` says why).
 */
function snoozedUnder(key: string, now: number): boolean {
  try {
    const until = Number(window.localStorage.getItem(key) ?? '0')
    return Number.isFinite(until) && until > now
  } catch {
    return false
  }
}

export function isSnoozed(now = Date.now()): boolean {
  return snoozedUnder(SNOOZE_KEY, now)
}

export function isReinstallSnoozed(now = Date.now()): boolean {
  return snoozedUnder(REINSTALL_SNOOZE_KEY, now)
}

/** Whoever is rendering a snooze, so a "Kasnije" reaches them immediately. */
const snoozeWatchers = new Set<() => void>()

function writeSnooze(key: string, ms: number, now: number): void {
  try {
    window.localStorage.setItem(key, String(now + ms))
  } catch {
    // Not remembered this time; the card simply comes back sooner.
  }
  // Both cards share the watcher set: there is one card slot on Početna, so
  // whichever of them was just put off, the same component re-renders.
  for (const watcher of snoozeWatchers) watcher()
}

/**
 * "Kasnije" means tomorrow, not never (#455).
 *
 * The old banner wrote a permanent flag, so one × on an iPhone silenced both
 * the install hint and, with it, the only route to notifications on that
 * device. A timestamp costs the same and forgets on its own.
 */
export function snooze(now = Date.now()): void {
  writeSnooze(SNOOZE_KEY, SNOOZE_MS, now)
}

/** The same, for the reinstall card, which is put off for a week (#684). */
export function snoozeReinstall(now = Date.now()): void {
  writeSnooze(REINSTALL_SNOOZE_KEY, REINSTALL_SNOOZE_MS, now)
}

function subscribeToSnooze(watcher: () => void): () => void {
  snoozeWatchers.add(watcher)
  return () => {
    snoozeWatchers.delete(watcher)
  }
}

/**
 * The snooze as a render-time fact, the way `usePlatform` reads the platform.
 *
 * An effect that called `setSnoozed(isSnoozed())` on mount would be the same
 * thing written as a cascading render, which is what it is: localStorage is an
 * external store, not state React owns. The server snapshot is `true` — QUIET —
 * rather than an honest `null`, because the one wrong answer here is showing an
 * install card for a frame to somebody who said "Kasnije" an hour ago.
 */
export function useSnoozed(): boolean {
  return useSyncExternalStore(subscribeToSnooze, isSnoozed, alwaysSnoozed)
}

/** The reinstall card's own snooze, read the same way (#684). */
export function useReinstallSnoozed(): boolean {
  return useSyncExternalStore(subscribeToSnooze, isReinstallSnoozed, alwaysSnoozed)
}

const alwaysSnoozed = () => true

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

/**
 * Everything the browser knows about push on THIS device, read once (#682).
 *
 * Two screens ask the same four questions — Profil's switch and Početna's
 * widget — and they used to ask them with the same twelve lines of effect
 * apiece. The questions are asynchronous (only the subscription is, but the
 * others are worthless without it) and they are facts of the browser, so they
 * are read together and reported together: a screen that had the permission but
 * not yet the subscription would render a frame of the wrong answer.
 *
 * `looking` is a state and not a flag, because "we have not asked yet" is a
 * third thing and neither screen may draw either answer during it — a switch
 * that shows "isključeno" for a beat to somebody who turned it on last week is
 * a lie with a spinner.
 */
export type PushFacts =
  | { state: 'looking' }
  | {
      state: 'known'
      /** THIS browser holds a subscription; `null` when it will not say. */
      subscribed: boolean | null
      permission: NotificationPermission | null
      supported: boolean
    }

export function usePushFacts(vapidPublicKey: string | null | undefined): PushFacts {
  const [facts, setFacts] = useState<PushFacts>({ state: 'looking' })

  useEffect(() => {
    let cancelled = false
    const look = async () => {
      // No key means the deployment cannot send at all, which is a "no" a
      // browser would never give us; asking it anyway would be theatre.
      const subscribed = vapidPublicKey ? await hasPushSubscription() : false
      if (cancelled) return
      setFacts({
        state: 'known',
        subscribed,
        permission: notificationPermission(),
        supported: pushSupported(),
      })
    }
    void look()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  return facts
}
