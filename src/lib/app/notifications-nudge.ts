import type { AppPlatform } from './platform'
import type { InstallOffer } from './install-nudge'

// Whether Početna tells this device it is not getting the push (#682).
//
// The app has had a push switch since #569 and nothing that mentions it. A
// dancer who never opened Profil never learnt it was there, and #670 found the
// sharp end of that: somebody reinstalled Cecilija from another browser, the
// old subscription died with the old icon, and nothing anywhere would have said
// so until he missed a nastup.
//
// **A browser question, never a server one.** Whether THIS device holds a
// subscription is a fact of the device, and the server's copy answers for some
// other phone the same dancer signed in on. Členovi's 🔔 mark stays what it is —
// the account's count out of `push_subscriptions` — because that is the right
// answer to the voditelj's question, which is a different question.
//
// **It does not snooze.** The install offer beside it can wait a day, because
// an install is an offer. This is not: a dancer who does not get the push does
// not get the evening. It goes when the subscription exists and no other way.
//
// It lives on ONE screen. Obavijesti mentions it in its empty state, where
// there is nothing else to say, and carries no standing banner: two permanent
// notices about one thing is nagging, and nagging is what people stop seeing.

/** What the widget says, or `none` when it renders nothing at all. */
export type NotificationsNudge = 'none' | 'enable' | 'blocked'

export interface NotificationsNudgeInput {
  /**
   * Whether a roster push could ever reach this login: an account with a linked
   * active moreškant. Everything else — a blagajna, a partner, `tehnika` on a
   * wall — is never sent one (`push-data.ts`), so telling it to switch
   * notifications on is a message with no recipient that would stand there for
   * ever, because nobody would ever resolve it.
   */
  isDancer: boolean
  /** `platform.ts`'s answer, or null before the browser has been asked. */
  platform: AppPlatform | null
  /** What the install card is doing right now. */
  installOffer: InstallOffer
  /** `serviceWorker` + `PushManager` + `Notification` all present. */
  pushSupported: boolean
  /**
   * THIS browser holds a subscription. `null` is the browser declining to say,
   * and it is NOT the same as `false` — see the rule.
   */
  subscribed: boolean | null
  /** `Notification.permission`, or null where there is no Notification API. */
  permission: NotificationPermission | null
}

/**
 * The widget, as one sentence.
 *
 * Read the clauses in order; two of them are the whole design.
 *
 * **The install card wins.** A device that is not installed yet is already
 * being asked for something, and on an iPhone the install IS the notification
 * switch (Safari exposes no `PushManager` outside a home screen app). Two cards
 * under one greeting saying "first install the app" is the app talking over
 * itself, so this one waits its turn.
 *
 * **`null` is silence.** The subscription check has three answers, not two, and
 * the third is "cannot tell". Telling somebody who already has notifications to
 * turn them on is worse than missing somebody who has not — the first is the app
 * being wrong out loud, the second is a gap a voditelj still sees on Členovi,
 * where the mark comes from the database and does not depend on a browser.
 *
 * `blocked` rather than `enable` for a denied permission, because a button that
 * cannot work is not a smaller version of a button that can. It is the same
 * rule Profil's switch applies to its three refusals: say the thing to do, never
 * offer a control that will do nothing.
 */
export function decideNotificationsNudge({
  isDancer,
  platform,
  installOffer,
  pushSupported,
  subscribed,
  permission,
}: NotificationsNudgeInput): NotificationsNudge {
  if (platform === null) return 'none'
  if (!isDancer) return 'none'
  if (installOffer !== 'none') return 'none'
  // Reachable past the clause above only when the install offer is snoozed: a
  // webview has no way to subscribe at any scroll position.
  if (platform === 'inapp') return 'none'
  if (!pushSupported) return 'none'
  if (subscribed !== false) return 'none'
  return permission === 'denied' ? 'blocked' : 'enable'
}
