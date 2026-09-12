'use client'

import { APP_STRINGS } from '@/lib/app/strings'

// The numbered "how to install" steps, shared by the banner on `/app` and the
// full-screen guide at `/app/instalacija` (#455).
//
// Presentational on purpose: every decision (which platform, is there a
// one-tap prompt, has this device already installed) belongs to the caller, so
// the guide page can let a voditelj FLIP between platforms while showing
// somebody else's phone, and the banner can show only the one it detected.

/** The three platforms that have instructions. `inapp` gets a way out instead. */
export type StepPlatform = 'ios' | 'android' | 'desktop'

const STEPS: Record<StepPlatform, readonly string[]> = {
  ios: APP_STRINGS.install.iosSteps,
  android: APP_STRINGS.install.androidSteps,
  desktop: APP_STRINGS.install.desktopSteps,
}

/**
 * The iOS share glyph, drawn rather than described.
 *
 * Step one is "find this icon", and on a phone in English, in a bottom bar full
 * of other icons, a picture is the whole instruction. Inline SVG so it inherits
 * the text colour and needs no asset.
 */
function ShareGlyph() {
  return (
    <svg
      className="app__install-glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
    </svg>
  )
}

export function InstallSteps({
  platform,
  canPrompt = false,
  busy = false,
  error = null,
  onInstall,
}: {
  platform: StepPlatform
  /** Chromium handed us a `beforeinstallprompt`: one tap replaces the list. */
  canPrompt?: boolean
  busy?: boolean
  error?: string | null
  onInstall?: () => void
}) {
  if (canPrompt && onInstall) {
    return (
      <div className="app__install-one-tap">
        <button type="button" className="app__button app__button--small" disabled={busy} onClick={onInstall}>
          {busy ? APP_STRINGS.install.acting : APP_STRINGS.install.action}
        </button>
        {error && <p className="app__answer-error">{error}</p>}
      </div>
    )
  }

  return (
    <ol className="app__install-steps">
      {STEPS[platform].map((step, index) => (
        <li key={step} className="app__install-step">
          {platform === 'ios' && index === 0 && <ShareGlyph />}
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}
