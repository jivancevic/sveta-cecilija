'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { ONBOARDING_STORAGE_KEY } from '@/lib/app/onboarding'
import { isIos, pushSupported, standalone, subscribeToPush } from '../push-client'

// The Dobrodošlica (#457, glossary: *Dobrodošlica*).
//
// Three steps, and one of the two facts that shorten the list is a BROWSER
// fact: a phone already running the app from its home screen has nothing to
// install (the other, a deployment with no calendar feed, is a prop). So the
// first render — server and client alike — is the full list, deterministic on
// both sides and therefore hydration-safe, and an effect drops step 1 once the
// browser has been asked. `matchMedia` read during render instead would be a
// hydration mismatch; read after mount it costs an installed phone one frame of
// a step it does not need.
//
// Nothing here is remembered on the account. At the moment the walkthrough ends
// — finished or skipped, which count the same, because a dancer who taps
// "Preskoči" has answered the question the walkthrough asked — this component
// asks the SERVER for the cookie (`POST /api/app/onboarding/done`, which a
// script-written cookie cannot replace: ITP would cap it at seven days) and
// writes the localStorage twin itself. On mount it reads that twin back: a
// device that has seen the walkthrough but lost its cookie re-asks for one and
// goes straight to the list instead of sitting through the three steps again.
//
// The notification step runs the REAL subscribe flow (`push-client.ts`, shared
// with the Više switch), never a fake one: an onboarding that pretends to ask
// for permission and then does not would leave a dancer certain they are
// subscribed and silent all season.

type Step = 'install' | 'push' | 'calendar'

const TOAST_MS = 1600
const PUSH_CONFIRM_MS = 900

/** Tell the server this device is done. Failure is silent: the twin still holds. */
async function rememberOnDevice(): Promise<void> {
  await fetch('/api/app/onboarding/done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {})
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

const SHARE_PATH = 'M12 3v12M8 7l4-4 4 4M5 11v9h14v-9'
const CHECK_PATH = 'M5 12l5 5 9-10'
const BELL_PATH = 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0'
const BOLT_PATH = 'M13 2 4 14h7l-1 8 9-12h-7z'
const CAL_PATH = 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4'
const MENU_PATH = 'M4 7h16M4 12h16M4 17h16'

export function Onboarding({
  vapidPublicKey,
  calendarUrl,
  nextPerformanceLabel,
}: {
  vapidPublicKey: string | null
  calendarUrl: string | null
  /** "četvrtak, 17. rujna", or null when the season has nothing left. */
  nextPerformanceLabel: string | null
}) {
  const router = useRouter()
  const [steps, setSteps] = useState<Step[]>(() =>
    calendarUrl ? ['install', 'push', 'calendar'] : ['install', 'push'],
  )
  // `null` until the browser has been asked: step 1 draws no platform until it
  // knows which one it is (#457 review), rather than telling an Android phone
  // about Safari's share sheet for one frame.
  const [ios, setIos] = useState<boolean | null>(null)
  const [canPush, setCanPush] = useState(false)
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pushNote, setPushNote] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  /** The calendar was handed to the phone or copied: the way on is "Dalje". */
  const [calendarTaken, setCalendarTaken] = useState(false)
  /** A device that has already seen this, on its way back to the list. */
  const [rescuing, setRescuing] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])

  useEffect(() => {
    let cancelled = false
    // One pass that asks the browser the three things only it knows, then
    // reconciles. Deferred rather than run in the effect body so the first
    // paint is the server's markup exactly, which is what keeps hydration
    // quiet on a phone that is already installed.
    const look = async () => {
      const installed = standalone()
      const onIos = isIos()
      const push = pushSupported() && Boolean(vapidPublicKey)
      if (cancelled) return
      setIos(onIos)
      setCanPush(push)
      if (!installed) return
      // Already on the home screen: step 1 is answered, so it leaves the list.
      setSteps((current) => current.filter((s) => s !== 'install'))
      setIndex((i) => (i > 0 ? i - 1 : 0))
    }
    void look()
    return () => {
      cancelled = true
    }
  }, [vapidPublicKey])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const t of pending) clearTimeout(t)
    }
  }, [])

  // The rescue (#457 review). This device has been through the walkthrough —
  // the twin says so — and only the cookie is missing: expired, cleared with
  // the site data, or never kept by a browser in private mode. Ask for it again
  // and go, so a lost cookie costs a redirect rather than three steps.
  useEffect(() => {
    let cancelled = false
    const rescue = async () => {
      let seen = false
      try {
        seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
      } catch {
        seen = false
      }
      if (!seen || cancelled) return
      setRescuing(true)
      await rememberOnDevice()
      if (!cancelled) router.replace('/app')
    }
    void rescue()
    return () => {
      cancelled = true
    }
  }, [router])

  /** The walkthrough is over: remember it on this device and go to the list. */
  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    } catch {
      // Not remembered here; the cookie below is the record anyway.
    }
    void rememberOnDevice().then(() => router.replace('/app'))
  }, [router])

  const advance = useCallback(() => {
    setPushNote(null)
    if (index + 1 >= steps.length) setDone(true)
    else setIndex(index + 1)
  }, [steps, index])

  async function enablePush() {
    if (busy) return
    setBusy(true)
    setPushNote(null)
    const result = await subscribeToPush(vapidPublicKey)
    setBusy(false)
    if (result === 'subscribed') {
      setPushNote(APP_STRINGS.onboarding.push.on)
      later(advance, PUSH_CONFIRM_MS)
      return
    }
    setPushNote(result === 'denied' ? APP_STRINGS.push.denied : APP_STRINGS.push.failed)
  }

  // The handoff never advances on a timer (#457 review). `webcal://` leaves the
  // browser: the phone is in the calendar app agreeing to a subscription, and a
  // walkthrough that scrolled on without them means they come back to a step
  // they never saw. So the step waits, and the way on becomes "Dalje".
  function subscribeCalendar() {
    if (!calendarUrl) return
    // `webcal://` is what hands the feed to the calendar app instead of
    // downloading a file the phone then has nowhere to put.
    window.location.href = calendarUrl.replace(/^https?:\/\//, 'webcal://')
    setCalendarTaken(true)
  }

  async function copyCalendar() {
    if (!calendarUrl) return
    try {
      await navigator.clipboard.writeText(calendarUrl)
      setToast(APP_STRINGS.onboarding.calendar.copied)
      setCalendarTaken(true)
    } catch {
      // Nothing is on the clipboard, so the step is not done: the primary stays
      // "Kopiraj link" and the URL is on screen to read.
      setToast(APP_STRINGS.calendar.copyFailed)
    }
    later(() => setToast(null), TOAST_MS)
  }

  const step = steps[Math.min(index, steps.length - 1)]

  // On its way back to the list: showing step 1 for the length of one fetch
  // would be the walkthrough this device already answered, flashed again.
  if (rescuing) return <div className="app__ob" />

  return (
    <div className={`app__ob${done ? ' app__ob--done' : ''}`}>
      {!done && (
        <div className="app__ob-top">
          <div className="app__steps" aria-hidden="true">
            {steps.map((key, i) => (
              <i
                key={key}
                className={i < index ? 'is-done' : i === index ? 'is-current' : ''}
              />
            ))}
          </div>
          <button type="button" className="app__ob-skip" onClick={finish}>
            {APP_STRINGS.onboarding.skip}
          </button>
        </div>
      )}

      {done ? (
        <>
          <div className="app__ob-body">
            <div className="app__ob-check">
              <Icon path={CHECK_PATH} />
            </div>
            <h1>{APP_STRINGS.onboarding.done.title}</h1>
            <p>
              {nextPerformanceLabel
                ? APP_STRINGS.onboarding.done.next(nextPerformanceLabel)
                : APP_STRINGS.onboarding.done.nothing}
            </p>
          </div>
          <div className="app__ob-actions">
            <button type="button" className="app__ob-primary" onClick={finish}>
              {APP_STRINGS.onboarding.done.primary}
            </button>
          </div>
        </>
      ) : step === 'install' ? (
        <>
          <div className="app__ob-body">
            <span className="app__ob-step">
              {APP_STRINGS.onboarding.step(index + 1, steps.length)}
            </span>
            <h1>{APP_STRINGS.onboarding.install.title}</h1>
            <p>{APP_STRINGS.onboarding.install.body}</p>
            {ios === null ? (
              // The browser has not been asked yet. The box keeps its place so
              // the step does not jump, but it says nothing: naming the wrong
              // menu for one frame is worse than naming none (#457 review).
              <div className="app__ob-illus app__ob-illus--wait" aria-hidden="true" />
            ) : (
              <div className="app__ob-illus">
                <div className="app__ios-row">
                  {ios ? <Icon path={SHARE_PATH} /> : <Icon path={MENU_PATH} />}
                  <span>
                    {ios
                      ? APP_STRINGS.onboarding.install.iosShare
                      : APP_STRINGS.onboarding.install.androidMenu}
                  </span>
                </div>
                <div className="app__ios-row">
                  <span className="app__ios-gap" aria-hidden="true" />
                  <span>
                    {ios
                      ? APP_STRINGS.onboarding.install.iosAdd
                      : APP_STRINGS.onboarding.install.androidAdd}
                  </span>
                  <span className="app__ios-plus" aria-hidden="true">
                    +
                  </span>
                </div>
                <p className="app__ios-hint">
                  {ios
                    ? APP_STRINGS.onboarding.install.iosHint
                    : APP_STRINGS.onboarding.install.androidHint}
                </p>
              </div>
            )}
          </div>
          <div className="app__ob-actions">
            <button type="button" className="app__ob-primary" onClick={advance}>
              {APP_STRINGS.onboarding.install.primary}
            </button>
            <button type="button" className="app__ob-link" onClick={advance}>
              {APP_STRINGS.onboarding.install.later}
            </button>
          </div>
        </>
      ) : step === 'push' ? (
        <>
          <div className="app__ob-body">
            <span className="app__ob-step">
              {APP_STRINGS.onboarding.step(index + 1, steps.length)}
            </span>
            <h1>{APP_STRINGS.onboarding.push.title}</h1>
            <p>{APP_STRINGS.onboarding.push.body}</p>
            <div className="app__ob-illus">
              <div className="app__notif">
                <span className="app__notif-icon" aria-hidden="true">
                  M
                </span>
                <span className="app__notif-text">
                  <b>{APP_STRINGS.onboarding.push.sampleTitle}</b>
                  <span>{APP_STRINGS.onboarding.push.sampleBody}</span>
                </span>
                <small>{APP_STRINGS.onboarding.push.sampleWhen}</small>
              </div>
            </div>
            <div className="app__benefits">
              <div>
                <Icon path={BELL_PATH} />
                {APP_STRINGS.onboarding.push.benefitLineup}
              </div>
              <div>
                <Icon path={BOLT_PATH} />
                {APP_STRINGS.onboarding.push.benefitAlarm}
              </div>
              <div>
                <Icon path={CAL_PATH} />
                {APP_STRINGS.onboarding.push.benefitChange}
              </div>
            </div>
          </div>
          <div className="app__ob-actions">
            {canPush ? (
              <button
                type="button"
                className="app__ob-primary"
                disabled={busy}
                onClick={enablePush}
              >
                {busy ? APP_STRINGS.onboarding.push.working : APP_STRINGS.onboarding.push.primary}
              </button>
            ) : (
              // No `PushManager` on this phone at all: a primary button here
              // would do nothing and look broken, so the sentence takes its
              // place and "Ne sada" is the only way on.
              <p className="app__ob-note">
                {ios ? APP_STRINGS.push.iosBody : APP_STRINGS.install.body}
              </p>
            )}
            {pushNote && <p className="app__ob-note">{pushNote}</p>}
            <button type="button" className="app__ob-link" onClick={advance}>
              {APP_STRINGS.onboarding.push.skip}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="app__ob-body">
            <span className="app__ob-step">
              {APP_STRINGS.onboarding.step(index + 1, steps.length)}
            </span>
            <h1>{APP_STRINGS.onboarding.calendar.title}</h1>
            <p>{APP_STRINGS.onboarding.calendar.body}</p>
            {ios === false && <p>{APP_STRINGS.onboarding.calendar.googleHint}</p>}
            <div className="app__calcard">
              <h2>{APP_STRINGS.onboarding.calendar.cardTitle}</h2>
              <p>{APP_STRINGS.onboarding.calendar.cardBody}</p>
              <code>{calendarUrl}</code>
            </div>
          </div>
          <div className="app__ob-actions">
            {/* Two platforms, two handoffs (#457 review). An iPhone takes the
                subscription itself through `webcal://`; everywhere else the
                honest move is the link on the clipboard, because Android's
                calendar is Google's web one and it wants a URL pasted into a
                form. Either way the step waits for the dancer to come back. */}
            {calendarTaken ? (
              <button type="button" className="app__ob-primary" onClick={advance}>
                {APP_STRINGS.onboarding.calendar.next}
              </button>
            ) : ios ? (
              <>
                <button type="button" className="app__ob-primary" onClick={subscribeCalendar}>
                  {APP_STRINGS.onboarding.calendar.primary}
                </button>
                <button type="button" className="app__ob-ghost" onClick={copyCalendar}>
                  {APP_STRINGS.onboarding.calendar.copy}
                </button>
              </>
            ) : (
              <button type="button" className="app__ob-primary" onClick={copyCalendar}>
                {APP_STRINGS.onboarding.calendar.copy}
              </button>
            )}
            <button type="button" className="app__ob-link" onClick={advance}>
              {APP_STRINGS.onboarding.calendar.skip}
            </button>
          </div>
        </>
      )}

      <div className={`app__ob-toast${toast ? ' is-shown' : ''}`} role="status">
        {toast}
      </div>
    </div>
  )
}
