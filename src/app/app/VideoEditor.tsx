'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'
import type { RosterMessageCounts } from '@/lib/app/roster-message-data'
import { MAX_VIDEO_URL_LENGTH } from '@/lib/app/video-link'
import { Button, Note, Sheet } from './ui'

// The Snimka: the link, and the one ring (#692).
//
// TWO acts on one card, and keeping them apart is the whole design. **Spremi
// link** stores what was pasted and rings nobody, so a typo costs nothing and
// can be fixed all afternoon; **Pošalji obavijest** rings every phone on the
// roster and can be pressed exactly once for this evening. If saving also rang,
// the second correction would wake seventy-six people.
//
// The send cannot fire without the sheet: Pošalji only opens it, the sheet's own
// button is the only thing that posts, and the route refuses a body without
// `confirmed: true`. The sheet says both numbers out loud — computed on the
// server — plus the one line #654's sheet does not need: **this is sent only
// once**. That sentence is there because the send is the single irreversible
// thing on this screen.
//
// Once sent, the button is REPLACED by the receipt ("Obavijest poslana: …"),
// which is read back from the claim in `performance_notifications` rather than
// from a column of its own — the lock and the receipt are one record, so the
// sentence on the screen and the refusal a second press would get cannot
// disagree. The receipt stays even after the link is cleared: it records that
// the video was out, not that it still is.

const S = APP_STRINGS.video

export function VideoEditor({
  performanceId,
  initialUrl,
  notifiedLabel,
  counts,
}: {
  performanceId: string
  initialUrl: string | null
  /** The receipt, already in the Zagreb wall clock, or null when never sent. */
  notifiedLabel: string | null
  counts: RosterMessageCounts
}) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  // What is SAVED, not what is typed: a voditelj half-way through pasting a new
  // link has not yet given the roster anything to be told about.
  const [savedUrl, setSavedUrl] = useState(initialUrl)
  const mayRing = Boolean(savedUrl) && !notifiedLabel && !sent

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/app/performances/${performanceId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; url?: string | null; error?: string }
        | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? S.failed)
        return
      }
      const saved = body.url ?? null
      setSavedUrl(saved)
      // The server normalises a YouTube paste, so the field is filled from the
      // ANSWER rather than left showing what was typed: the voditelj sees the
      // link that was actually stored.
      setUrl(saved ?? '')
      setMessage(saved ? S.saved : S.cleared)
      router.refresh()
    } catch {
      setError(S.failed)
    } finally {
      setSaving(false)
    }
  }

  async function ring() {
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/app/performances/${performanceId}/video/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; people?: number; devices?: number; error?: string }
        | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? S.ring.failed)
        return
      }
      setSent(S.ring.sent(body.people ?? 0, body.devices ?? 0))
      setConfirming(false)
      router.refresh()
    } catch {
      setError(S.ring.failed)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="app__video-edit">
      <label className="app__note-label" htmlFor="video-url">
        {S.label}
      </label>
      <input
        id="video-url"
        type="url"
        inputMode="url"
        className="app__input"
        maxLength={MAX_VIDEO_URL_LENGTH}
        placeholder={S.placeholder}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <p className="app__video-hint">{S.hint}</p>

      <div className="app__video-actions">
        <Button variant="ghost" disabled={saving} onClick={() => void save()}>
          {saving ? S.saving : S.save}
        </Button>
        {mayRing && (
          <Button variant="primary" onClick={() => setConfirming(true)}>
            <Bell size={16} aria-hidden="true" />
            {S.ring.open}
          </Button>
        )}
      </div>

      {savedUrl && (
        <a className="app__video-watch" href={savedUrl} target="_blank" rel="noopener noreferrer">
          {S.watch}
        </a>
      )}

      {/* The permanent receipt. `sent` is this session's answer; `notifiedLabel`
          is the claim the server read back, and after a refresh they say the
          same thing. */}
      {notifiedLabel && <p className="app__video-sent">{S.ring.sentAt(notifiedLabel)}</p>}
      {sent && <Note>{sent}</Note>}
      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}

      <Sheet
        open={confirming}
        title={S.ring.title}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button
              variant="primary"
              className="ui-btn--wide"
              disabled={sending}
              onClick={() => void ring()}
            >
              {sending ? S.ring.sending : S.ring.send}
            </Button>
            <Button
              variant="ghost"
              className="ui-btn--wide"
              disabled={sending}
              onClick={() => setConfirming(false)}
            >
              {S.ring.cancel}
            </Button>
          </>
        }
      >
        <p className="app__msg-counts">{S.ring.counts(counts.devices, counts.people)}</p>
        {counts.withoutLogin > 0 && <Note>{S.ring.withoutLogin(counts.withoutLogin)}</Note>}
        <p className="app__video-once">{S.ring.once}</p>
        {error && <Note>{error}</Note>}
      </Sheet>
    </section>
  )
}
