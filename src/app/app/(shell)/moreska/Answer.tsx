'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AttendanceStatus } from '@/lib/attendance/rules'
import { AnswerPair, type AnswerPairState } from '../../AnswerPair'

// Dolazim / Ne dolazim, on the hero of Moreška and of Početna (#565, Q30).
//
// One tap and no second question. **A dancer never sends an army**: the answer
// counts in the army of their primary role, decided on the server
// (`decideAttendanceAnswer`), which is why nothing in this component knows what
// an army is. A voditelj who needs to move somebody does it on Stanje, where
// the person and the evening are both in front of them.
//
// **Both buttons are always on screen** (#592). Until #592 an answered pair
// collapsed into a statement ("Dolaziš · Crni") with a "Promijeni" link under
// it, which made changing an answer a two-tap job and printed on a button the
// one fact a dancer does not choose. Now the chosen one is filled and the other
// outlined at .55, and switching is one tap on the other one. The shape and the
// animation are `AnswerPair`; this component is the write.
//
// The optimistic update is the same trade it always was: on a phone in the
// street the round trip is the slow part and a two-state toggle guesses right
// nearly always, so the previous answer comes straight back when the server
// disagrees, with its sentence verbatim under the pair.

const PAIR: Record<AttendanceStatus, AnswerPairState> = {
  coming: 'yes',
  not_coming: 'no',
}

export function Answer({
  performanceId,
  memberId,
  current,
  disabled = false,
  lockNote,
  small = false,
}: {
  performanceId: string
  memberId: string
  current: AttendanceStatus | null
  disabled?: boolean
  lockNote?: string | null
  /** Half the width of a hero: one of two evenings on the same day (#591). */
  small?: boolean
}) {
  const router = useRouter()
  const [answer, setAnswer] = useState<AttendanceStatus | null>(current)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function send(next: AttendanceStatus) {
    if (disabled || saving) return
    const previous = answer
    setError(null)
    setAnswer(next)
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
      // The ArmyBar and the row chips are server-rendered, so refresh them once
      // the write landed rather than counting a second time in the browser.
      // Every write in `/app` owes this since #593: the tabs are prefetched, so
      // a cached screen is only as fresh as the last refresh.
      router.refresh()
    } catch {
      setAnswer(previous)
      setError(APP_STRINGS.answer.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AnswerPair
        small={small}
        disabled={disabled || saving}
        state={answer ? PAIR[answer] : 'none'}
        onChoose={(next) => void send(next === 'yes' ? 'coming' : 'not_coming')}
      />
      {lockNote && <p className="app__answer-note">{lockNote}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </>
  )
}
