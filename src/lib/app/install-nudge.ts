import type { AndroidInstaller, AppPlatform } from './platform'

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

// The fourth answer is #684's, and it is the opposite question: not "shall we
// offer an install" but "did the install that already happened put this person
// in the wrong Cecilija". An app installed from Samsung Internet runs in
// Samsung's engine, with Samsung's cookie jar, Samsung's localStorage and
// Samsung's push subscription. The login, the theme and the notifications the
// dancer set in Chrome are not the ones behind the icon, and until this card
// nothing in the app could say so — it cost three rounds of remote guessing on
// a Galaxy A55 whose theme switch did nothing at all.
//
// It reuses the card slot rather than adding a card, and that is not only
// tidiness: `installed` returns `none` today, so the slot under the greeting is
// empty for exactly these people, while Početna already carries the install
// offer and #682's notifications widget for everybody else.

/** What the offer says, or `none` when it renders nothing at all. */
export type InstallOffer = 'none' | 'install' | 'inapp' | 'reinstall'

export interface InstallOfferInput {
  /** `platform.ts`'s answer for this browser. */
  platform: AppPlatform
  /** "Kasnije" is still in force on this device. */
  snoozed: boolean
  /** Chromium parked a `beforeinstallprompt`: this browser CAN install. */
  canPrompt: boolean
  /**
   * `androidInstaller()` on THIS browser's UA (#684). An installed app keeps
   * reporting the UA of the browser that built it, which is what makes the
   * wrong Cecilija recognisable at all. `chrome` for anything we cannot tell
   * apart from Chrome, and for every non-Android UA.
   */
  installer: AndroidInstaller
  /** "Kasnije" on the REINSTALL card, which is its own, longer snooze. */
  reinstallSnoozed: boolean
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
 *
 * The `installed` clause is where #684 lives, and the two snoozes stay apart
 * on purpose. They are answers to different questions — "not now" to an offer,
 * and "not now" to a chore that costs this device its push subscription — and
 * the install one is written by the Dobrodošlica on its way out, by somebody
 * who has just installed the app and would otherwise silence the very card
 * telling them they installed it from the wrong place.
 */
export function decideInstallOffer({
  platform,
  snoozed,
  canPrompt,
  installer,
  reinstallSnoozed,
}: InstallOfferInput): InstallOffer {
  if (platform === 'installed') {
    if (installer !== 'own-apk' || reinstallSnoozed) return 'none'
    return 'reinstall'
  }
  if (snoozed) return 'none'
  if (platform === 'inapp') return 'inapp'
  if (platform === 'desktop' && !canPrompt) return 'none'
  return 'install'
}
