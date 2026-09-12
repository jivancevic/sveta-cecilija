'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { MAX_NOTE_LENGTH } from '@/lib/app/note'

// The voditelj note as a field with a save button (#436, story 25).
//
// Not optimistic and not auto-saving: this text goes out as a push to everyone
// who has not said "ne dolazim", so pressing Spremi is the moment the voditelj
// decides to tell the roster. An input that saved on blur would notify the
// world about a half-typed sentence.
//
// A moreškant never sees this component — the page renders it for `voditelj`
// only — and the route refuses them anyway.

export function NoteEditor({
  performanceId,
  initialNote,
}: {
  performanceId: string
  initialNote: string | null
}) {
  const router = useRouter()
  const [note, setNote] = useState(initialNote ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/app/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceId, note }),
      })
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? APP_STRINGS.note.failed)
        return
      }
      setMessage(APP_STRINGS.note.saved)
      // The note is rendered by the server above this form; refresh so the two
      // cannot disagree after a save.
      router.refresh()
    } catch {
      setError(APP_STRINGS.note.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="app__note-edit">
      <label className="app__note-label" htmlFor="voditelj-note">
        {APP_STRINGS.note.label}
      </label>
      <textarea
        id="voditelj-note"
        className="app__textarea"
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        placeholder={APP_STRINGS.note.placeholder}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" className="app__button" disabled={saving} onClick={save}>
        {saving ? APP_STRINGS.note.saving : APP_STRINGS.note.save}
      </button>
      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}
