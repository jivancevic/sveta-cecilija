import type { InstallOffer } from './install-nudge'
import type { PushRefusal } from './push-refusal'

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
// other phone the same dancer signed in on. Članovi's 🔔 mark stays what it is —
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
  /** What the install card is doing right now. */
  installOffer: InstallOffer
  /**
   * What stands between this device and a subscription, from `push-refusal.ts`
   * — the same answer Profil's switch renders its three Notes from, read here
   * rather than spelled a second time.
   */
  refusal: PushRefusal
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
 * being asked for something, and two cards under one greeting saying "first
 * install the app" is the app talking over itself, so this one waits its turn.
 * The refusal clause below then covers the same device once that card has been
 * snoozed, and every other device that cannot subscribe.
 *
 * **`null` is silence.** The subscription check has three answers, not two, and
 * the third is "cannot tell". Telling somebody who already has notifications to
 * turn them on is worse than missing somebody who has not — the first is the app
 * being wrong out loud, the second is a gap a voditelj still sees on Članovi,
 * where the mark comes from the database and does not depend on a browser.
 *
 * `blocked` rather than `enable` for a denied permission, because a button that
 * cannot work is not a smaller version of a button that can. That is Profil's
 * rule for its own three refusals, and `refusal` above is literally the same
 * function, so the two screens cannot disagree about which phone can ring.
 */
export function decideNotificationsNudge({
  isDancer,
  installOffer,
  refusal,
  subscribed,
  permission,
}: NotificationsNudgeInput): NotificationsNudge {
  if (!isDancer) return 'none'
  if (installOffer !== 'none') return 'none'
  if (refusal !== null) return 'none'
  if (subscribed !== false) return 'none'
  return permission === 'denied' ? 'blocked' : 'enable'
}
