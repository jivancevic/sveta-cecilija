'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { AppPlatform } from '@/lib/app/platform'
import { APP_STRINGS } from '@/lib/app/strings'
import { InstallSteps, type StepPlatform } from '../InstallSteps'
import { useInstallPrompt, usePlatform, webviewHostIsIos } from '../use-install'

// The full-screen install guide (#455).
//
// It exists for the moment that actually converts a roster: a voditelj at a
// rehearsal with a QR code on the wall, walking twenty-five people through the
// same three steps at once. Which is also why the platform is a SWITCH rather
// than only a detection - the voditelj is holding somebody else's phone half
// the time, and the page has to be able to show the other instructions.
//
// No login: a dancer following the QR has not signed in yet, and instructions
// are not a secret. The page is under the `/app` layout, so `noindex` and the
// Croatian chrome come with it.

const DEVICES: Array<[StepPlatform, string]> = [
  ['ios', APP_STRINGS.install.deviceIphone],
  ['android', APP_STRINGS.install.deviceAndroid],
  ['desktop', APP_STRINGS.install.deviceDesktop],
]

/** What to preselect for a device that is not one of the three. */
function initialDevice(platform: AppPlatform): StepPlatform {
  if (platform === 'ios') return 'ios'
  if (platform === 'android') return 'android'
  if (platform === 'inapp') return webviewHostIsIos() ? 'ios' : 'android'
  return 'desktop'
}

export function InstallGuide() {
  const detected = usePlatform()
  // A completed install is the one thing that moves the platform under us, and
  // it is our own doing rather than something to detect again.
  const [installedNow, setInstalledNow] = useState(false)
  const [chosen, setChosen] = useState<StepPlatform | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { canPrompt, install } = useInstallPrompt()

  const platform: AppPlatform | null = installedNow ? 'installed' : detected
  const device: StepPlatform | null = chosen ?? (detected === null ? null : initialDevice(detected))

  async function runInstall() {
    if (busy) return
    setBusy(true)
    setError(null)
    const accepted = await install()
    setBusy(false)
    if (accepted) setInstalledNow(true)
    else setError(APP_STRINGS.install.failed)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/app')
      setCopied(true)
    } catch {
      setError(APP_STRINGS.install.failed)
    }
  }

  // Nothing until the browser has been read, for the same reason the banner
  // waits: a flash of the wrong platform's steps is worse than a beat of white.
  if (platform === null || device === null) return null

  const installed = platform === 'installed'
  const inapp = platform === 'inapp'

  return (
    <>
      {installed && <p className="app__install-done">{APP_STRINGS.install.installedTitle}</p>}

      {inapp && (
        <section className="app__hint">
          <strong>{APP_STRINGS.install.inappTitle}</strong>
          {APP_STRINGS.install.inappBody}
          <p className="app__install-how">
            {webviewHostIsIos() ? APP_STRINGS.install.inappIos : APP_STRINGS.install.inappAndroid}
          </p>
          <div className="app__hint-actions">
            <button type="button" className="app__button app__button--small" onClick={copyLink}>
              {APP_STRINGS.install.inappCopy}
            </button>
          </div>
          {copied && <p className="app__install-how">{APP_STRINGS.install.inappCopied}</p>}
        </section>
      )}

      {/*
        An installed device still shows the steps once a platform is PICKED:
        the voditelj at the rehearsal has the app already and is holding a
        dancer's phone, which is the whole reason the switch exists.
      */}
      {(!installed || chosen !== null) && (
        <InstallSteps
          platform={device}
          // The one-tap prompt belongs to THIS browser, so it is only offered
          // while the shown instructions are the ones for this browser.
          canPrompt={canPrompt && !installed && device === initialDevice(platform)}
          busy={busy}
          error={error}
          onInstall={runInstall}
        />
      )}

      <div className="app__install-devices">
        <span className="app__install-devices-label">{APP_STRINGS.install.otherDevice}</span>
        {DEVICES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`app__install-device${device === value ? ' app__install-device--on' : ''}`}
            aria-pressed={device === value}
            onClick={() => setChosen(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="app__install-outro">
        {APP_STRINGS.install.guideDone}{' '}
        <Link className="app__link" href="/app">
          {APP_STRINGS.install.guideOpenApp}
        </Link>
      </p>
    </>
  )
}
