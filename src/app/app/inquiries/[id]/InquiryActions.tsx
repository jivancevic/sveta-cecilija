'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { InquiryState } from '@/lib/app/inquiries-query'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button } from '../../ui'

// The two named actions of one enquiry (#507, #476's "named actions only"),
// in the T1 skin (#570): Odgovori is the screen's one primary, because opening
// the reply is what somebody came here to do.
//
// **Odgovori** is an anchor, not a button, because it is not a request: the
// `mailto:` is built on the server (`inquiries-mailto.ts`) and the phone or the
// laptop opens Gmail with the address, the subject and the quote already in it.
// Cecilija never sends this mail; Tatjana answers from `info@moreska.eu`, where
// the thread and the sent copy belong.
//
// **Označi riješenim** is the one write, and it is a switch rather than a
// toggle: the button posts the state the row should be in, so the undo is the
// same button the other way round and a retry after a flaky connection cannot
// flip it back. Nothing here is optimistic — a success calls `router.refresh()`
// and the server re-renders the state line above.

const S = APP_STRINGS.inquiries.actions

export function InquiryActions({
  inquiryId,
  status,
  mailto,
}: {
  inquiryId: string
  status: InquiryState
  /** Null when the enquiry carries no address to reply to. */
  mailto: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const handled = status === 'handled'

  async function setHandled(next: boolean) {
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch(`/api/app/inquiries/${inquiryId}/handled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handled: next }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        // The route is ours, so its refusals are already the Croatian sentences
        // in `inquiries-handled.ts` and they say which thing went wrong.
        setError(body?.error ?? S.failed)
        return
      }
      setDone(next ? S.handled : S.reopened)
      router.refresh()
    } catch {
      setError(S.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app__actions">
      {done && <p className="app__done">{done}</p>}
      {error && <p className="app__error">{error}</p>}

      <div className="ui-btns">
        {mailto ? (
          <a className="ui-btn ui-btn--primary" href={mailto}>
            {S.reply}
          </a>
        ) : (
          <p className="app__quiet">{S.noEmail}</p>
        )}

        <Button
          variant={handled ? 'link' : 'ghost'}
          disabled={busy}
          onClick={() => void setHandled(!handled)}
        >
          {busy ? S.working : handled ? S.reopen : S.handle}
        </Button>
      </div>
    </section>
  )
}
