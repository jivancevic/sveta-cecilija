'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import type { JoinCandidate } from '@/lib/app/join-data'

// Tapping your own name, then waiting (#463).
//
// Two screens in one component, because they are one moment for the dancer: the
// list, and then the wait that ends with the app opening by itself. The wait is
// a poll rather than a push, since the device has no account yet and therefore
// no subscription; five seconds is well inside how long a voditelj takes to
// look at their phone, and the page is in the foreground because the dancer is
// watching it.
//
// **It asks once on mount, before showing anything.** A phone that already has
// a pending claim in its cookie — reloaded, locked and reopened, or back after
// the ten-minute cap — would otherwise be shown the list again, and its tap
// would be refused as "somebody is already waiting for this name" (which is
// itself, one minute ago). That was a dead end the dancer could not get out of
// (#463 review).

/** Five seconds: the voditelj is in the room, not in another timezone. */
const POLL_MS = 5000
/** Ten minutes of waiting is not a wait any more, it is a misunderstanding. */
const MAX_POLLS = 120

type Phase = 'loading' | 'list' | 'waiting' | 'approved' | 'rejected' | 'expired'

export function JoinClaim({ code, candidates }: { code: string; candidates: JoinCandidate[] }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [pairing, setPairing] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const polls = useRef(0)

  const poll = useCallback(async () => {
    const res = await fetch('/api/app/join/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const body = (await res.json().catch(() => null)) as
      | { status?: string; pairing?: string | null }
      | null
    // The number comes back with a pending answer, so a phone that reloaded can
    // show the dancer what to read out. It is this device's own claim.
    if (body?.pairing) setPairing(body.pairing)
    return body?.status ?? 'pending'
  }, [])

  // Does this device already have a claim in flight? Asked once, before the
  // list is rendered, so a reload rejoins the wait instead of starting a second
  // request that the index would refuse.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await poll()
        if (cancelled) return
        setPhase(status === 'pending' ? 'waiting' : 'list')
      } catch {
        if (!cancelled) setPhase('list')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poll])

  // The wait. It ends on any answer that is not "pending": on `approved` the
  // status route has already set the session cookie, so all this has to do is
  // go to `/app`.
  useEffect(() => {
    if (phase !== 'waiting') return
    let cancelled = false
    polls.current = 0

    const timer = setInterval(async () => {
      if (cancelled) return
      polls.current += 1
      if (polls.current > MAX_POLLS) {
        setPhase('expired')
        return
      }
      try {
        const status = await poll()
        if (cancelled) return
        if (status === 'approved') {
          setPhase('approved')
          router.replace('/app')
          router.refresh()
        } else if (status === 'rejected') {
          setPhase('rejected')
        } else if (status === 'expired' || status === 'none') {
          setPhase('expired')
        }
      } catch {
        // A dropped request in a hall with bad reception is not an answer:
        // keep waiting, the next tick asks again.
      }
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [phase, poll, router])

  async function claim(candidate: JoinCandidate) {
    if (busyId) return
    setError(null)
    setBusyId(candidate.id)
    try {
      const res = await fetch('/api/app/join', {
        method: 'POST',
        // The `/app` request guard requires JSON: a cross-site HTML form can
        // only send the other three content types.
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, memberId: candidate.id }),
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; pairing?: string }
        | null
      if (!res.ok) {
        setError(body?.error ?? APP_STRINGS.join.unexpected)
        setBusyId(null)
        return
      }
      setPairing(body?.pairing ?? null)
      setPhase('waiting')
    } catch {
      setError(APP_STRINGS.join.unexpected)
    }
    setBusyId(null)
  }

  if (phase === 'loading') {
    return (
      <p className="app__lead" role="status">
        {APP_STRINGS.join.loading}
      </p>
    )
  }

  if (phase === 'waiting' || phase === 'approved') {
    return (
      <>
        <p className="app__notice" role="status">
          {phase === 'approved' ? APP_STRINGS.join.approved : APP_STRINGS.join.waiting}
        </p>
        {/* The number the voditelj has to see next to the name before they
            approve. It is what separates "this phone asked for Ivan" from
            "somebody asked for Ivan" (#463 review). */}
        {phase === 'waiting' && pairing && (
          <div className="app__join-pairing">
            <p className="app__join-pairing-label">{APP_STRINGS.join.pairingLabel}</p>
            <p className="app__join-pairing-value">{pairing}</p>
          </div>
        )}
      </>
    )
  }

  if (phase === 'rejected' || phase === 'expired') {
    return (
      <>
        <p className="app__error" role="alert">
          {phase === 'rejected' ? APP_STRINGS.join.rejected : APP_STRINGS.join.expired}
        </p>
        {phase === 'expired' && (
          <button className="app__button" type="button" onClick={() => setPhase('list')}>
            {APP_STRINGS.join.title}
          </button>
        )}
      </>
    )
  }

  if (candidates.length === 0) {
    return <div className="app__empty-state">{APP_STRINGS.join.empty}</div>
  }

  return (
    <>
      {error && <p className="app__answer-error">{error}</p>}
      <div className="app__pick">
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            className="app__more-row app__pick-row"
            disabled={busyId !== null}
            onClick={() => claim(c)}
          >
            <span className="app__pick-name">
              <strong>{c.nickname || c.name}</strong>
              {c.nickname && <small>{c.name}</small>}
            </span>
            <span aria-hidden="true">{busyId === c.id ? '...' : '›'}</span>
          </button>
        ))}
      </div>
    </>
  )
}
