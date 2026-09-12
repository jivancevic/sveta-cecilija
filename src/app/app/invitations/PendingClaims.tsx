'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'

export interface PendingClaimRow {
  id: string
  name: string
  nickname: string | null
  /** The three digits on the waiting dancer's own screen (#463 review). */
  pairing: string | null
}

// The queue the join code feeds, and the tap that empties it (#463).
//
// This is the human check the whole design rests on: no SMS gateway, no code to
// verify, just a voditelj looking at the name on the screen and at the person
// in front of them. Approving OPENS A LOGIN, so the buttons are deliberately
// not optimistic — the row stays busy until the server has answered, and the
// list is then re-read from the server rather than patched here.
//
// The **pairing number** is what makes that check mean something (#463 review).
// A name is exactly what a stranger holding the code can also tap, and the
// dancer whose name was taken would read "somebody is already waiting for this
// name" and assume it is their own request. So the waiting phone shows three
// digits, this row shows the same three, and the voditelj approves only when
// they match. The server never checks them: this is a check between two people.
export function PendingClaims({ claims }: { claims: PendingClaimRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(claimId: string, decision: 'approve' | 'reject') {
    if (busyId) return
    setError(null)
    setBusyId(claimId)
    try {
      const res = await fetch('/api/app/join/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, decision }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? APP_STRINGS.join.decideFailed)
        setBusyId(null)
        return
      }
      router.refresh()
    } catch {
      setError(APP_STRINGS.join.decideFailed)
    }
    setBusyId(null)
  }

  return (
    <section className="app__more-block">
      <h2 className="app__month-head">
        <span>{APP_STRINGS.join.pendingTitle}</span>
      </h2>

      {error && <p className="app__answer-error">{error}</p>}

      {claims.length === 0 ? (
        <div className="app__empty-state">{APP_STRINGS.join.pendingNone}</div>
      ) : (
        <>
          <p className="app__invite-hint">{APP_STRINGS.join.pairingHint}</p>
          {claims.map((claim) => (
            <div key={claim.id} className="app__invite-row">
              <p className="app__invite-who">
                <strong>{claim.nickname || claim.name}</strong>
                {claim.nickname && <span> · {claim.name}</span>}
                {claim.pairing && (
                  <span className="app__join-pairing-chip">
                    {APP_STRINGS.join.pairingCheck(claim.pairing)}
                  </span>
                )}
              </p>
              <div className="app__invite-actions">
                <button
                  className="app__button"
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => decide(claim.id, 'approve')}
                >
                  {busyId === claim.id ? APP_STRINGS.join.deciding : APP_STRINGS.join.approve}
                </button>
                <button
                  className="app__button app__button--quiet"
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => decide(claim.id, 'reject')}
                >
                  {APP_STRINGS.join.reject}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
