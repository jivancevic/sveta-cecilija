import { describe, expect, it } from 'vitest'
import { decideNotificationsNudge, type NotificationsNudgeInput } from './notifications-nudge'

// #682 — the widget that tells a device it is not getting the push.
//
// Asserted on the RULE rather than on the card, because every one of these
// cases is a browser state that cannot be reached from a test that renders: a
// webview, a denied permission, a browser that will not say whether it has a
// subscription.

/** A dancer's installed phone with notifications off: the one case that speaks. */
const off: NotificationsNudgeInput = {
  isDancer: true,
  platform: 'installed',
  installOffer: 'none',
  pushSupported: true,
  subscribed: false,
  permission: 'default',
}

const decide = (over: Partial<NotificationsNudgeInput> = {}) =>
  decideNotificationsNudge({ ...off, ...over })

describe('decideNotificationsNudge', () => {
  it('speaks to a dancer whose installed phone is not subscribed', () => {
    expect(decide()).toBe('enable')
  })

  it('goes the moment the device has a subscription', () => {
    expect(decide({ subscribed: true })).toBe('none')
  })

  it('says nothing at all until the browser has been asked', () => {
    // The server renders nothing and so does the first client frame: a card
    // that appeared during SSR would flash "turn these on" at a phone that
    // already rings.
    expect(decide({ platform: null })).toBe('none')
  })

  it('is silent when the browser will not say whether it is subscribed', () => {
    // Three answers, not two. Being wrong out loud at somebody who already has
    // notifications is worse than missing somebody who has not — and whoever is
    // missed is still visible to a voditelj on Članovi.
    expect(decide({ subscribed: null })).toBe('none')
  })

  it('never speaks to a login a roster push could not reach', () => {
    // A blagajna, a partner, `tehnika` on a wall. Nobody would ever resolve it,
    // so it would stand there for ever.
    expect(decide({ isDancer: false })).toBe('none')
  })

  it('waits while the install card is asking for something', () => {
    // Both cards would say "first install the app", one under the other.
    expect(decide({ installOffer: 'install', platform: 'ios', pushSupported: false })).toBe('none')
    expect(decide({ installOffer: 'inapp', platform: 'inapp' })).toBe('none')
  })

  it('stays quiet in a webview even once the install card is snoozed', () => {
    // The snooze silences the install card, not the webview's inability to
    // subscribe at any scroll position.
    expect(decide({ platform: 'inapp', installOffer: 'none' })).toBe('none')
  })

  it('stays quiet in a browser that has no push to offer', () => {
    expect(decide({ pushSupported: false })).toBe('none')
  })

  it('says where to unblock rather than offering a button that cannot work', () => {
    expect(decide({ permission: 'denied' })).toBe('blocked')
  })

  it('treats a granted permission with no subscription as switchable', () => {
    // Permission survives an unsubscribe, so this is the reinstall case #670
    // found: the old subscription died and nothing had to be re-asked.
    expect(decide({ permission: 'granted' })).toBe('enable')
    expect(decide({ permission: null })).toBe('enable')
  })

  it('speaks on a plain Android tab, where push works without installing', () => {
    // Deliberately not gated on `installed`: what matters is whether this
    // browser can hold a subscription, and on Android a tab can.
    expect(decide({ platform: 'android', installOffer: 'none' })).toBe('enable')
  })
})
