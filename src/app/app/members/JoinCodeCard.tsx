'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Note, Section } from '../ui'

// The rehearsal code, on the voditelj's screen (#463; on Članovi since #511).
//
// The QR is rendered by the SERVER and handed down as a data URL, because it is
// a picture of a fact the server owns; rotating simply asks for a new page.
// That also means the phone can be held up in the room as the QR itself, which
// is how this will actually be used more often than a printed sheet.
//
// "Novi kod" says what it costs before it is pressed: rotating kills the old
// code, which is the point, and a voditelj who rotates it mid-rehearsal out of
// curiosity should not be surprised when the sheet on the wall stops working.
export function JoinCodeCard({
  code,
  validUntil,
  url,
  qr,
}: {
  code: string | null
  validUntil: string | null
  url: string | null
  qr: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function rotate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/join/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? APP_STRINGS.join.codeFailed)
        setBusy(false)
        return
      }
      // The new code, its QR and its expiry are all server facts: re-render
      // rather than patching three of them into the DOM by hand.
      router.refresh()
    } catch {
      setError(APP_STRINGS.join.codeFailed)
    }
    setBusy(false)
  }

  return (
    <section className="app__join-block">
      <Section title={APP_STRINGS.join.codeTitle} />
      <Note>{APP_STRINGS.join.codeIntro}</Note>

      {error && <p className="app__answer-error">{error}</p>}

      {code ? (
        <div className="app__join-code">
          {qr && (
            <Image
              className="app__join-qr"
              src={qr}
              alt={code}
              width={220}
              height={220}
              unoptimized
            />
          )}
          <p className="app__join-code-value">{code}</p>
          {url && <p className="app__join-code-url">{url}</p>}
          {validUntil && <p className="app__join-code-valid">{APP_STRINGS.join.codeValid(validUntil)}</p>}
        </div>
      ) : (
        <p className="app__empty">{APP_STRINGS.join.codeNone}</p>
      )}

      <p className="app__invite-hint">{APP_STRINGS.join.rotateHint}</p>
      <Button variant="ghost" onClick={() => void rotate()} disabled={busy}>
        {busy
          ? APP_STRINGS.join.codeWorking
          : code
            ? APP_STRINGS.join.codeRotate
            : APP_STRINGS.join.codeCreate}
      </Button>
    </section>
  )
}
