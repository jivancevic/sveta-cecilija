'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AttendanceStatus } from '@/lib/attendance/rules'
import { AnswerDots } from '../../AnswerDots'
import { AnswerPair, type AnswerPairState } from '../../AnswerPair'

// Dolazim / Ne dolazim, on the hero of Moreška and of Početna (#565, Q30), and
// on every future row of the season list since #624.
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
// **Two shapes, one write** (#624). The hero keeps the full-width pair, a row
// on the list gets `AnswerDots`, and the difference between them is a size and
// an animation, never a rule: both go through `useAnswer` below, so there is
// exactly one place that knows what a tap posts and what an un-tap means.
//
// The optimistic update is the same trade it always was: on a phone in the
// street the round trip is the slow part and a two-state toggle guesses right
// nearly always, so the previous answer comes straight back when the server
// disagrees, with its sentence verbatim under the pair.
//
// The one guess it CANNOT make is the un-tap, and it does not try. Taking back
// a `dolazim` that has stood ten minutes is an odustajanje rather than a
// deletion (`resolveUndo`), so the row survives as "ne dolazim" — which the
// browser has no way of working out, because the ten minutes are measured from
// a stamp only the server holds. So every answer settles on the status the
// route returns rather than on the guess: the circle may land on red where the
// finger asked for none, and that is the truth about where the dancer stands.

const PAIR: Record<AttendanceStatus, AnswerPairState> = {
  coming: 'yes',
  not_coming: 'no',
}

/** What a tap posts: an answer, or "take mine back" (#624). */
type AnswerWrite = AttendanceStatus | 'undo'

function useAnswer({
  performanceId,
  memberId,
  current,
  disabled,
}: {
  performanceId: string
  memberId: string
  current: AttendanceStatus | null
  disabled: boolean
}) {
  const router = useRouter()
  const [answer, setAnswer] = useState<AttendanceStatus | null>(current)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // **The same evening is on this screen TWICE** (#624 review): the hero is
  // also the first row of the list under it, so a tap on the row's green circle
  // left the hero's pair showing yesterday's answer, and the other way round.
  // `router.refresh()` re-renders the server half and hands down a new
  // `current`, but it cannot reach into a client island's `useState`.
  //
  // So the prop is re-read when the SERVER's answer changes, which is React's
  // own way of adjusting state during render rather than an effect that would
  // paint the stale value first. A write of our own settles this state itself
  // and then refreshes into the same value, so the two never fight.
  const [serverAnswer, setServerAnswer] = useState<AttendanceStatus | null>(current)
  if (serverAnswer !== current) {
    setServerAnswer(current)
    setAnswer(current)
  }

  async function send(next: AnswerWrite) {
    if (disabled || saving) return
    const previous = answer
    setError(null)
    setAnswer(next === 'undo' ? null : next)
    setSaving(true)
    try {
      const res = await fetch('/api/app/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceId, memberId, status: next }),
      })
      const body = (await res.json().catch(() => null)) as {
        error?: string
        status?: AttendanceStatus | null
      } | null
      if (!res.ok) {
        setAnswer(previous)
        setError(body?.error ?? APP_STRINGS.answer.failed)
        return
      }
      // The server's word, not the guess: see the header on the un-tap.
      setAnswer(body?.status ?? null)
      // The ArmyBar and the rows are server-rendered, so refresh them once the
      // write landed rather than counting a second time in the browser. Every
      // write in `/app` owes this since #593: the tabs are prefetched, so a
      // cached screen is only as fresh as the last refresh.
      router.refresh()
    } catch {
      setAnswer(previous)
      setError(APP_STRINGS.answer.failed)
    } finally {
      setSaving(false)
    }
  }

  /** One side was pressed: that is the answer, whatever stood before it. */
  function set(side: 'yes' | 'no') {
    void send(side === 'yes' ? 'coming' : 'not_coming')
  }

  /**
   * The same press on a circle that is ALREADY filled takes the answer back
   * (#624), and on the other one it is a plain answer.
   *
   * Only the circles do this, never the hero's pair. On the pair a second tap
   * on Dolazim is a fat finger on a full-width button — a very common one, on a
   * card a dancer taps the moment the screen opens — and turning that into a
   * take-back would put people on the voditelj's Odustali list for pressing yes
   * twice. On a 34px circle a second tap is the only gesture there is for
   * un-doing, which is exactly what Josip asked the circles for.
   */
  function choose(side: 'yes' | 'no') {
    if ((answer ? PAIR[answer] : 'none') === side) return void send('undo')
    set(side)
  }

  return {
    state: answer ? PAIR[answer] : ('none' as AnswerPairState),
    error,
    saving,
    set,
    choose,
  }
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
  const { state, error, saving, set } = useAnswer({
    performanceId,
    memberId,
    current,
    disabled,
  })

  return (
    <>
      <AnswerPair small={small} disabled={disabled || saving} state={state} onChoose={set} />
      {lockNote && <p className="app__answer-note">{lockNote}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </>
  )
}

/**
 * The same answer as two circles, at the end of a row on the season list
 * (#624).
 *
 * It shows no error sentence of its own on purpose: fifteen rows deep, a
 * paragraph appearing under one of them would push the rest of the month down
 * the screen under the reader's thumb. A refused write puts the circle back
 * where it was, which on a list is the whole of what went wrong, and the hero
 * above — or the evening's own screen — is where a dancer gets the sentence.
 */
export function RowAnswer({
  performanceId,
  memberId,
  current,
  disabled = false,
}: {
  performanceId: string
  memberId: string
  current: AttendanceStatus | null
  disabled?: boolean
}) {
  const { state, saving, choose } = useAnswer({ performanceId, memberId, current, disabled })

  return <AnswerDots state={state} disabled={disabled || saving} onChoose={choose} />
}
