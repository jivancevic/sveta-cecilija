'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { RosterMessageCounts } from '@/lib/app/roster-message-data'
import { ROSTER_MESSAGE_MAX } from '@/lib/push/roster-message'
import { Button, Card, Note, Section, Sheet } from '../../ui'

// "Napiši poruku": the voditelj's own sentence to the roster (#654, ADR-0028).
//
// The screen renders this ONLY for a reader holding `moreska` — hidden, not
// greyed with "traži Moreška". Izvedbe's six actions grey themselves (#567) so
// a blagajna knows the action exists and who to ask; nobody needs to ask a
// voditelj for permission to write to the dancers, so for everybody else the
// control simply is not there. The route re-checks `moreska` regardless, which
// is the actual lock.
//
// **The send cannot fire without the sheet.** Pošalji opens it; the sheet's own
// button is the only thing that posts, and the route refuses a body without
// `confirmed: true`. The sheet says both numbers out loud, computed on the
// server before a word was typed, because the failure this feature is designed
// against is not a mis-tap: it is somebody sending the same sentence twice
// because they could not tell whether the first one went through. The counts
// are the receipt.
//
// The field stays filled while it sends and is cleared only on success, so a
// failure leaves the voditelj with their sentence rather than with an apology.

const S = APP_STRINGS.notifications.message

export function RosterMessage({ counts }: { counts: RosterMessageCounts }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const ready = text.trim() !== ''

  async function send() {
    if (sending) return
    setSending(true)
    setError(null)
    setSent(null)
    try {
      const res = await fetch('/api/app/notifications/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, confirmed: true }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; people?: number; devices?: number; error?: string }
        | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? S.failed)
        return
      }
      setSent(S.sent(body.people ?? 0, body.devices ?? 0))
      setText('')
      setConfirming(false)
      // The message is now a row in the sender's own Sandučić too, and the bell
      // lives in the server-rendered shell: only a refresh moves either.
      router.refresh()
    } catch {
      setError(S.failed)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="app__more-group">
      <Section title={S.title} note={S.hint} />

      <Card>
        <label className="app__sr-only" htmlFor="roster-message">
          {S.title}
        </label>
        <textarea
          id="roster-message"
          className="app__textarea"
          rows={3}
          maxLength={ROSTER_MESSAGE_MAX}
          placeholder={S.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="app__msg-foot">
          <span className="ui-small">{S.counter(text.length, ROSTER_MESSAGE_MAX)}</span>
          <Button variant="primary" disabled={!ready} onClick={() => setConfirming(true)}>
            <Send size={18} strokeWidth={1.75} aria-hidden="true" />
            {S.send}
          </Button>
        </div>
        {error && <Note>{error}</Note>}
        {sent && <Note>{sent}</Note>}
      </Card>

      <Sheet
        open={confirming}
        title={S.confirmTitle}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button
              variant="primary"
              className="ui-btn--wide"
              disabled={sending}
              onClick={() => void send()}
            >
              {sending ? S.sending : S.send}
            </Button>
            <Button
              variant="ghost"
              className="ui-btn--wide"
              disabled={sending}
              onClick={() => setConfirming(false)}
            >
              {S.cancel}
            </Button>
          </>
        }
      >
        <p className="app__msg-counts">{S.counts(counts.devices, counts.people)}</p>
        {counts.withoutLogin > 0 && <Note>{S.withoutLogin(counts.withoutLogin)}</Note>}
        <p className="app__msg-preview">{text.trim()}</p>
        {error && <Note>{error}</Note>}
      </Sheet>
    </section>
  )
}
