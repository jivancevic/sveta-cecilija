import { describe, expect, it } from 'vitest'
import { decideInstallOffer } from './install-nudge'

// The table the phones would otherwise have to answer (#616). The interesting
// cases are all combinations of three booleans, so they are all here.

describe('decideInstallOffer', () => {
  it('offers nothing to an app that is already on the home screen', () => {
    expect(decideInstallOffer({ platform: 'installed', snoozed: false, canPrompt: true })).toBe(
      'none',
    )
  })

  it('stays gone on a home screen app even while a stale snooze is in force', () => {
    expect(decideInstallOffer({ platform: 'installed', snoozed: true, canPrompt: false })).toBe(
      'none',
    )
  })

  it('offers the install on an uninstalled iPhone', () => {
    expect(decideInstallOffer({ platform: 'ios', snoozed: false, canPrompt: false })).toBe('install')
  })

  it('offers the install on Android, prompt or no prompt', () => {
    expect(decideInstallOffer({ platform: 'android', snoozed: false, canPrompt: false })).toBe(
      'install',
    )
    expect(decideInstallOffer({ platform: 'android', snoozed: false, canPrompt: true })).toBe(
      'install',
    )
  })

  it('tells a webview the way out rather than how to install', () => {
    expect(decideInstallOffer({ platform: 'inapp', snoozed: false, canPrompt: false })).toBe('inapp')
  })

  it('offers a desktop browser the install only when the browser itself can', () => {
    expect(decideInstallOffer({ platform: 'desktop', snoozed: false, canPrompt: true })).toBe(
      'install',
    )
    // Safari and Firefox: no prompt ever, and no menu entry the guide could name.
    expect(decideInstallOffer({ platform: 'desktop', snoozed: false, canPrompt: false })).toBe(
      'none',
    )
  })

  it('goes quiet for a day on "Kasnije", on every uninstalled platform', () => {
    for (const platform of ['ios', 'android', 'desktop', 'inapp'] as const) {
      expect(decideInstallOffer({ platform, snoozed: true, canPrompt: true })).toBe('none')
    }
  })
})
