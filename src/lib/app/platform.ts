// Which install conversation THIS browser can actually have, and which
// question to ask first (#455).
//
// The install banner used to ask two questions in a fixed order and that was
// wrong in three ways at once (#455): an Android Chrome tab always has a
// `PushManager`, so the install offer never reached the platform where it is a
// single tap; an iPhone in Viber's in-app browser was told to "add to the home
// screen" from a menu that has no such entry; and one × silenced the banner
// forever on exactly the device where installing is the precondition for
// notifications at all.
//
// So the decision moved here, as two pure functions over facts the component
// reads from the browser. Pure because the interesting cases are UA strings and
// capability flags, and a table test over them is worth more than a phone in
// each hand.

/** The install story a browser can tell. `installed` short-circuits the rest. */
export type AppPlatform = 'installed' | 'inapp' | 'ios' | 'android' | 'desktop'

/**
 * UA fragments of embedded browsers that CANNOT install anything.
 *
 * These are webviews owned by another app, and the share sheet they show is
 * that app's, not the browser's: there is no "Add to Home Screen" in it at any
 * scroll position. The only useful thing to say to somebody in one is "open
 * this in Safari". Croatia's list first (Viber and WhatsApp are how a link
 * actually travels here), then the rest of the usual suspects.
 *
 * Lowercase, matched against a lowercased UA.
 */
const IN_APP_FRAGMENTS = [
  'viber',
  'whatsapp',
  'fban', // Facebook iOS
  'fbav', // Facebook Android
  'fb_iab', // Facebook in-app browser
  'fbios',
  'messenger',
  'instagram',
  'linkedinapp',
  'micromessenger', // WeChat
  'snapchat',
  'tiktok',
  'musical_ly',
  '; wv', // any Android WebView
]

export interface PlatformInput {
  userAgent: string
  /** `display-mode: standalone` or iOS's `navigator.standalone`. */
  standalone: boolean
  /** `navigator.maxTouchPoints`: an iPad reports a Macintosh UA. */
  touchPoints: number
}

/**
 * The platform of one browser session.
 *
 * `standalone` wins over everything: a home screen app is installed no matter
 * what its UA says, and nothing below this line has anything to offer it.
 */
export function detectPlatform({ userAgent, standalone, touchPoints }: PlatformInput): AppPlatform {
  if (standalone) return 'installed'

  const ua = userAgent.toLowerCase()
  if (IN_APP_FRAGMENTS.some((fragment) => ua.includes(fragment))) return 'inapp'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  // iPadOS 13+ reports a desktop Safari UA. A Mac with a touch screen does not
  // exist, so touch points are the honest tell.
  if (ua.includes('macintosh') && touchPoints > 1) return 'ios'
  if (ua.includes('android')) return 'android'
  return 'desktop'
}

/**
 * Android browsers that build the install APK THEMSELVES (#668).
 *
 * Installing a web app on Android means handing Android a generated APK. Chrome
 * does not build it: Google's minting service does, and signs it, and Play
 * Protect lets it through. A browser without access to that service falls back
 * to generating one on the phone, with an old `targetSdk` — which is word for
 * word the sentence Josip photographed: *"Ta je aplikacija napravljena za
 * stariju verziju Androida i ne uključuje najnoviju zaštitu privatnosti."*
 *
 * **This is not "these browsers always fail".** Production says otherwise: of
 * the four other people on Samsung Internet, all four are installed. The block
 * is the phone's call, not the browser's, and it is Android that makes it. So
 * the guide never tells anybody their browser is broken — it offers the route
 * that has a minting service behind it, for whoever needs one.
 *
 * Lowercase, matched against a lowercased UA. Brave and most Chromium skins are
 * deliberately absent: their UA is Chrome's, and a browser we cannot tell from
 * Chrome is one we have no business warning about.
 */
const OWN_APK_FRAGMENTS = [
  'samsungbrowser',
  'firefox',
  'fxios',
  'opr/', // Opera, which spells itself OPR in the UA
  'opera',
  'yabrowser', // Yandex
  'miuibrowser',
  'heytapbrowser', // Oppo
  'huaweibrowser',
  'vivaldi',
  'ucbrowser',
]

/** Which install route this Android browser has. */
export type AndroidInstaller = 'chrome' | 'own-apk'

/**
 * Whether this Android browser mints its own install APK.
 *
 * `chrome` for anything we cannot tell apart from Chrome, which is the safe
 * answer: it changes nothing about what the guide shows.
 */
export function androidInstaller(userAgent: string): AndroidInstaller {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua.includes('android')) return 'chrome'
  return OWN_APK_FRAGMENTS.some((fragment) => ua.includes(fragment)) ? 'own-apk' : 'chrome'
}

/**
 * An address that opens in Chrome on Android, and nowhere else.
 *
 * Android's own `intent://` scheme with the package named. A browser that does
 * not understand it does nothing at all, which is why the guide always offers
 * the copy button beside it: a control that silently fails is worse than a
 * sentence telling somebody to paste an address.
 *
 * Only https is wrapped. Anything else is handed back untouched rather than
 * turned into an intent, because an intent URL built out of an arbitrary string
 * is a way to open something that was never meant to be opened.
 */
export function chromeIntentUrl(url: string): string | null {
  if (typeof url !== 'string') return null
  const prefix = 'https://'
  if (!url.startsWith(prefix)) return null
  const rest = url.slice(prefix.length)
  if (rest === '' || rest.includes('#')) return null
  return `intent://${rest}#Intent;scheme=https;package=com.android.chrome;end`
}

/**
 * The `beforeinstallprompt` capture, injected by the `/app` layout.
 *
 * Chromium fires this event ONCE, shortly after load, and a React effect that
 * has not hydrated yet misses it: the event is not replayed and the install
 * button would then never appear on the one platform where it is a single tap.
 * So the listener is installed inline, before hydration, and parks the event on
 * `window` for the component to pick up whenever it mounts.
 *
 * `appinstalled` clears it again, so a second tab does not keep offering an
 * install that already happened.
 */
export const INSTALL_PROMPT_KEY = '__moreskantInstallPrompt'
export const INSTALL_PROMPT_EVENT = 'moreskant:installprompt'
export const INSTALL_PROMPT_CAPTURE = `(function(){var w=window;w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();w.${INSTALL_PROMPT_KEY}=e;w.dispatchEvent(new Event('${INSTALL_PROMPT_EVENT}'))});w.addEventListener('appinstalled',function(){w.${INSTALL_PROMPT_KEY}=null;w.dispatchEvent(new Event('${INSTALL_PROMPT_EVENT}'))})})()`

/** localStorage key holding the epoch ms until which "Kasnije" is in force. */
export const SNOOZE_KEY = 'moreskant.install.snoozedUntil'
/** One day. Long enough to stop nagging, short enough to come back. */
export const SNOOZE_MS = 24 * 60 * 60 * 1000
