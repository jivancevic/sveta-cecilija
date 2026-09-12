import { describe, expect, it } from 'vitest'
import {
  decideInstallStep,
  detectPlatform,
  type AppPlatform,
  type InstallStep,
} from './platform'

// Real UA strings, kept verbatim: the point of this file is that a fragment
// list stays right as browsers change, and a paraphrased UA proves nothing.
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneViber:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Viber/20.6.0.0',
  iphoneWhatsApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24.10.76',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,2]',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.32.98',
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  const cases: Array<[string, string, number, AppPlatform]> = [
    ['iPhone Safari', UA.iphoneSafari, 5, 'ios'],
    ['iPhone Chrome', UA.iphoneChrome, 5, 'ios'],
    ['iPad Safari (Macintosh UA + touch)', UA.ipadSafari, 5, 'ios'],
    ['Android Chrome', UA.androidChrome, 5, 'android'],
    ['macOS Safari', UA.macSafari, 0, 'desktop'],
    ['Windows Chrome', UA.windowsChrome, 0, 'desktop'],
  ]

  it.each(cases)('%s is %s', (_name, userAgent, touchPoints, expected) => {
    expect(detectPlatform({ userAgent, standalone: false, touchPoints })).toBe(expected)
  })

  const inApp: Array<[string, string]> = [
    ['Viber', UA.iphoneViber],
    ['WhatsApp', UA.iphoneWhatsApp],
    ['Facebook', UA.iphoneFacebook],
    ['Instagram', UA.iphoneInstagram],
    ['Android WebView', UA.androidWebView],
  ]

  it.each(inApp)('%s is an in-app browser, not a platform', (_name, userAgent) => {
    expect(detectPlatform({ userAgent, standalone: false, touchPoints: 5 })).toBe('inapp')
  })

  it('standalone wins over every UA', () => {
    for (const userAgent of Object.values(UA)) {
      expect(detectPlatform({ userAgent, standalone: true, touchPoints: 5 })).toBe('installed')
    }
  })
})

describe('decideInstallStep', () => {
  const base = { platform: 'android' as AppPlatform, pushSupported: true, subscribed: false, snoozed: false }

  const cases: Array<[string, Partial<typeof base>, InstallStep]> = [
    // The bug this file exists for: an Android tab HAS a PushManager, so the
    // old two-question order never reached the install offer there.
    ['Android tab, nothing done yet', {}, 'push'],
    ['Android tab, already subscribed', { subscribed: true }, 'on'],
    // iOS in a tab: Safari exposes no PushManager at all, so "install" IS the
    // notification answer rather than a separate nicety.
    ['iPhone Safari tab', { platform: 'ios', pushSupported: false }, 'install'],
    ['iPhone home screen app', { platform: 'installed', pushSupported: true }, 'push'],
    ['iPhone home screen app, subscribed', { platform: 'installed', subscribed: true }, 'on'],
    // A webview cannot install and cannot subscribe: the only move is out.
    ['Viber webview', { platform: 'inapp', pushSupported: false }, 'inapp'],
    ['webview that claims push support', { platform: 'inapp' }, 'inapp'],
    // "Kasnije" silences every OFFER, and nothing else.
    ['snoozed Android tab', { snoozed: true }, 'none'],
    ['snoozed iPhone tab', { platform: 'ios', pushSupported: false, snoozed: true }, 'none'],
    ['snoozed webview', { platform: 'inapp', pushSupported: false, snoozed: true }, 'none'],
    ['snoozed but subscribed still shows the off switch', { snoozed: true, subscribed: true }, 'on'],
    // Installed and no push anywhere: there is nothing left to ask.
    ['installed browser without push', { platform: 'installed', pushSupported: false }, 'none'],
    // A desktop browser without push is still offered the install.
    ['desktop without push', { platform: 'desktop', pushSupported: false }, 'install'],
  ]

  it.each(cases)('%s → %s', (_name, patch, expected) => {
    expect(decideInstallStep({ ...base, ...patch })).toBe(expected)
  })
})
