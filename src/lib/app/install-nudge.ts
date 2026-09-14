import type { AppPlatform } from './platform'

// Whether Cecilija offers to install itself, right now, on this browser (#616).
//
// The app used to ask a different question and get a stale answer. The install
// instruction lived in one place a reader could be SENT to — the Dobrodošlica's
// first step — and `/app` sent them there on `needsOnboarding()`, which reads a
// cookie ("has this device been welcomed?") and a Member link ("is this reader a
// dancer?"). Both fail the person who is actually holding an uninstalled phone:
// a blagajna has no Member and could never reach the step at all, and a dancer
// who tapped "Kasnije" in June carries a cookie that says "welcomed" for a year
// while the home screen stays empty.
//
// So the question is asked of the browser instead. `display-mode: standalone`
// is true or false on every single load and cannot go stale, which means the
// offer needs no flag to appear and — this is the part a cookie could never do —
// needs no flag to DISAPPEAR either. Install the app and it is simply gone, on
// that device, that day, with nothing written anywhere.
//
// The Dobrodošlica keeps its own gate and its own register: its push and
// calendar steps are written for a dancer ("Reci nam dolaziš li", "Alarm od
// voditelja") and the box office has no business being walked through them.
// Finishing it snoozes this offer, so nobody is asked twice in one minute.

/** What the offer says, or `none` when it renders nothing at all. */
export type InstallOffer = 'none' | 'install' | 'inapp'

export interface InstallOfferInput {
  /** `platform.ts`'s answer for this browser. */
  platform: AppPlatform
  /** "Kasnije" is still in force on this device. */
  snoozed: boolean
  /** Chromium parked a `beforeinstallprompt`: this browser CAN install. */
  canPrompt: boolean
}

/**
 * The offer, as one sentence.
 *
 * A home screen app is offered nothing, snoozed or not — `installed` is the
 * answer the whole rule exists to read, so it is checked before the flag that
 * could only ever delay it. A webview is told the way out rather than how to
 * install, because there is no "add to home screen" in another app's share
 * sheet at any scroll position (`platform.ts`).
 *
 * The desktop clause is the one that is not obvious. A phone always has the
 * three taps the guide names, so the offer stands on iOS and Android whatever
 * the browser reports; a desktop browser that has never fired
 * `beforeinstallprompt` is Safari or Firefox, where there is no install to
 * describe and the guide's "ikona u adresnoj traci" names a control that is not
 * there. Offering it would be the app confidently giving a wrong instruction,
 * so on a desktop the browser's own capability is the permission to ask.
 */
export function decideInstallOffer({
  platform,
  snoozed,
  canPrompt,
}: InstallOfferInput): InstallOffer {
  if (platform === 'installed') return 'none'
  if (snoozed) return 'none'
  if (platform === 'inapp') return 'inapp'
  if (platform === 'desktop' && !canPrompt) return 'none'
  return 'install'
}
