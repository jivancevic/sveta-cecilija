'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// "Pošalji alarm" (#431) — the voditelj's control on `/app/izvedba/[id]`.
//
// It reports back how many DEVICES rang (#430, story 24), because that is the
// only honest answer to "will anyone hear this": a roster of twenty dancers with
// two subscriptions between them is a fact the voditelj needs before deciding to
// start phoning people. Nothing is optimistic here — unlike an attendance
// answer, the outcome is not guessable from the tap.
//
// The checkbox widens the audience from "no answer" to "no answer + ne dolazim"
// (story 22). It is unchecked by default: nudging someone who already said no is
// the deliberate case, not the normal one.
//
// No throttle and no disabled-after-send state: a desperate evening is allowed
// two alarms (story 23).

export function AlarmButton({ performanceId }: { performanceId: string }) {
  const [includeNotComing, setIncludeNotComing] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (sending) return
    setSending(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/app/alarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceId, includeNotComing }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; delivered?: number; people?: number; error?: string }
        | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? APP_STRINGS.alarm.failed)
        return
      }
      if ((body.people ?? 0) === 0) setMessage(APP_STRINGS.alarm.noRecipients)
      else if ((body.delivered ?? 0) === 0) setMessage(APP_STRINGS.alarm.noDevices)
      else setMessage(APP_STRINGS.alarm.sent(body.delivered ?? 0))
    } catch {
      setError(APP_STRINGS.alarm.failed)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="app__alarm">
      <label className="app__alarm-option">
        <input
          type="checkbox"
          checked={includeNotComing}
          onChange={(e) => setIncludeNotComing(e.target.checked)}
        />
        {APP_STRINGS.alarm.includeNotComing}
      </label>
      <button type="button" className="app__button" disabled={sending} onClick={send}>
        {sending ? APP_STRINGS.alarm.sending : APP_STRINGS.alarm.action}
      </button>
      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}
