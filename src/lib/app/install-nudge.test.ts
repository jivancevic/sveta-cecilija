import { describe, expect, it } from 'vitest'
import { decideInstallOffer, type InstallOfferInput } from './install-nudge'

// The table the phones would otherwise have to answer (#616, #684). The
// interesting cases are all combinations of a platform and four booleans, so
// they are all here, each spelled against a base of "nothing in the way".

const base: InstallOfferInput = {
  platform: 'android',
  snoozed: false,
  canPrompt: false,
  installer: 'chrome',
  reinstallSnoozed: false,
}

describe('decideInstallOffer', () => {
  it('offers nothing to an app that is already on the home screen', () => {
    expect(decideInstallOffer({ ...base, platform: 'installed', canPrompt: true })).toBe('none')
  })

  it('stays gone on a home screen app even while a stale snooze is in force', () => {
    expect(decideInstallOffer({ ...base, platform: 'installed', snoozed: true })).toBe('none')
  })

  it('offers the install on an uninstalled iPhone', () => {
    expect(decideInstallOffer({ ...base, platform: 'ios' })).toBe('install')
  })

  it('offers the install on Android, prompt or no prompt', () => {
    expect(decideInstallOffer({ ...base, platform: 'android' })).toBe('install')
    expect(decideInstallOffer({ ...base, platform: 'android', canPrompt: true })).toBe('install')
  })

  it('tells a webview the way out rather than how to install', () => {
    expect(decideInstallOffer({ ...base, platform: 'inapp' })).toBe('inapp')
  })

  it('offers a desktop browser the install only when the browser itself can', () => {
    expect(decideInstallOffer({ ...base, platform: 'desktop', canPrompt: true })).toBe('install')
    // Safari and Firefox: no prompt ever, and no menu entry the guide could name.
    expect(decideInstallOffer({ ...base, platform: 'desktop' })).toBe('none')
  })

  it('goes quiet for a day on "Kasnije", on every uninstalled platform', () => {
    for (const platform of ['ios', 'android', 'desktop', 'inapp'] as const) {
      expect(decideInstallOffer({ ...base, platform, snoozed: true, canPrompt: true })).toBe('none')
    }
  })
})

// The fourth answer (#684): an app already on the home screen, installed by a
// browser that mints its own APK, is a SEPARATE Cecilija — its own cookie jar,
// its own localStorage, its own push subscription. Nothing else in the app can
// see that, so the card slot that is empty for exactly these people says it.

describe('decideInstallOffer, installed by another browser', () => {
  const wrong: InstallOfferInput = { ...base, platform: 'installed', installer: 'own-apk' }

  it('asks a wrongly installed app to be reinstalled from Chrome', () => {
    expect(decideInstallOffer(wrong)).toBe('reinstall')
  })

  it('says nothing to an app installed from Chrome', () => {
    expect(decideInstallOffer({ ...wrong, installer: 'chrome' })).toBe('none')
  })

  it('goes quiet on its own "Kasnije"', () => {
    expect(decideInstallOffer({ ...wrong, reinstallSnoozed: true })).toBe('none')
  })

  it('is not silenced by the install offer, which is a different card', () => {
    // The Dobrodošlica writes that snooze on its way out, and it is about an
    // offer this reader has already accepted.
    expect(decideInstallOffer({ ...wrong, snoozed: true })).toBe('reinstall')
  })

  it('never reaches a browser that is still a tab, whatever installed it', () => {
    // `androidInstaller` answers for any Android UA, installed or not; only
    // `standalone` makes that answer mean "this app is the wrong Cecilija".
    for (const platform of ['android', 'ios', 'desktop', 'inapp'] as const) {
      expect(decideInstallOffer({ ...wrong, platform, canPrompt: true })).not.toBe('reinstall')
    }
  })
})
