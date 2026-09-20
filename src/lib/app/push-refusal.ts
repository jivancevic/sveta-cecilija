import type { AppPlatform } from './platform'

// Why this device cannot hold a push subscription at all (#569, extracted #682).
//
// It lived inside Profil's switch as a private `blockedReason` until Početna's
// widget needed the same three answers. They are not "the switch is off": a
// phone that cannot subscribe is a phone with something to do first, and both
// screens have to agree about which phone that is — otherwise Profil says
// "install the app first" while Početna offers a button that does nothing.
//
// `null` is the interesting answer: this device CAN subscribe, so whether it
// has is a separate question for `hasPushSubscription`.

/** What stands between this device and a subscription, or null when nothing does. */
export type PushRefusal = 'install' | 'inapp' | 'unsupported' | null

export interface PushRefusalInput {
  /** `platform.ts`'s answer, or null before the browser has been asked. */
  platform: AppPlatform | null
  /** `serviceWorker` + `PushManager` + `Notification` all present. */
  pushSupported: boolean
}

/**
 * The refusal, in the order the cases exclude each other.
 *
 * A webview first, because there is no way out of one that ends in a
 * subscription. Then iOS, where the install IS the notification switch: Safari
 * exposes no `PushManager` outside a home screen app, so a phone that is still
 * a tab is asked to install rather than told its browser is incapable — which
 * would be both wrong and a dead end. Everything else is a plain capability
 * question.
 */
export function pushRefusal({ platform, pushSupported }: PushRefusalInput): PushRefusal {
  if (platform === 'inapp') return 'inapp'
  if (platform === 'ios') return 'install'
  return pushSupported ? null : 'unsupported'
}
