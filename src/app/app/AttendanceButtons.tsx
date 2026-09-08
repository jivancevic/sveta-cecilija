'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AttendanceStatus } from '@/lib/attendance/rules'

// Dolazim / Ne dolazim (#422).
//
// The same pair of buttons serves the card and the detail view, and a voditelj
// answering on somebody's behalf uses it too — the only difference is the
// `memberId` it posts and how small it renders.
//
// The highlight is optimistic: on a phone in the street the round trip is the
// slow part, and the answer is a two-state toggle where guessing right is the
// normal case. When the server disagrees the previous answer comes straight
// back and the refusal is shown verbatim: the route answers with the very
// sentences this component shows on a locked button, so a refusal never reads
// like a different rule from the one the UI already stated.

export type AnswerScope = 'card' | 'row'

export function AttendanceButtons({
  performanceId,
  memberId,
  current,
  disabled = false,
  lockNote,
  scope = 'card',
  allowClear = false,
}: {
  performanceId: string
  memberId: string
  current: AttendanceStatus | null
  disabled?: boolean
  lockNote?: string | null
  scope?: AnswerScope
  allowClear?: boolean
}) {
  const router = useRouter()
  const [answer, setAnswer] = useState<AttendanceStatus | null>(current)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  async function send(next: AttendanceStatus | 'clear') {
    if (disabled || saving) return
    const previous = answer
    setError(null)
    setAnswer(next === 'clear' ? null : next)
    setSaving(true)
    try {
      const res = await fetch('/api/app/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceId, memberId, status: next }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setAnswer(previous)
        setError(body?.error ?? APP_STRINGS.answer.failed)
        return
      }
      // The headcounts and the lists are server-rendered, so refresh them once
      // the write landed rather than duplicating the count rule in the browser.
      startTransition(() => router.refresh())
    } catch {
      setAnswer(previous)
      setError(APP_STRINGS.answer.failed)
    } finally {
      setSaving(false)
    }
  }

  const cls = (value: AttendanceStatus) =>
    [
      'app__answer',
      `app__answer--${value === 'coming' ? 'yes' : 'no'}`,
      answer === value ? 'app__answer--on' : '',
      scope === 'row' ? 'app__answer--small' : '',
    ]
      .filter(Boolean)
      .join(' ')

  return (
    <div className="app__answers">
      <div className="app__answer-row">
        <button
          type="button"
          className={cls('coming')}
          aria-pressed={answer === 'coming'}
          disabled={disabled || saving}
          onClick={() => send('coming')}
        >
          {APP_STRINGS.answer.coming}
        </button>
        <button
          type="button"
          className={cls('not_coming')}
          aria-pressed={answer === 'not_coming'}
          disabled={disabled || saving}
          onClick={() => send('not_coming')}
        >
          {APP_STRINGS.answer.notComing}
        </button>
        {allowClear && answer !== null && (
          <button
            type="button"
            className="app__answer app__answer--clear app__answer--small"
            disabled={disabled || saving}
            onClick={() => send('clear')}
          >
            {APP_STRINGS.answer.clear}
          </button>
        )}
      </div>
      {lockNote && <p className="app__answer-note">{lockNote}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </div>
  )
}
