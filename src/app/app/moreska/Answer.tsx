'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import type { AttendanceStatus } from '@/lib/attendance/rules'
import { Button } from '../ui'

// Dolazim / Ne dolazim, on the hero of Moreška (#565, Q30).
//
// One tap and no second question. **A dancer never sends an army**: the answer
// counts in the army of their primary role, decided on the server
// (`decideAttendanceAnswer`), which is why nothing in this component knows what
// an army is beyond the word it prints back. A voditelj who needs to move
// somebody does it on Stanje, where the person and the evening are both in
// front of them.
//
// Once an answer stands the pair becomes a STATEMENT plus a way out: "Dolaziš ·
// Crni" (or "Ne dolaziš") and Promijeni, which re-opens the two buttons without
// writing anything. Clearing an answer is not offered here on purpose — "no
// answer" is a state you arrive in, not one a dancer chooses (glossary:
// *Attendance*), and the voditelj can still clear a row from Stanje.
//
// The confirmation pops on the answer LANDING, never on the tap, so what a
// dancer sees is the server agreeing with them (T1's `Button pop`). The
// optimistic highlight is the same trade `AttendanceButtons` made: on a phone
// in the street the round trip is the slow part and a two-state toggle guesses
// right nearly always, so the previous answer comes straight back when the
// server disagrees, with its sentence verbatim.

const S = APP_STRINGS.moreska

export function Answer({
  performanceId,
  memberId,
  current,
  currentArmy,
  disabled = false,
  lockNote,
  small = false,
}: {
  performanceId: string
  memberId: string
  current: AttendanceStatus | null
  /** "Crni" / "Bili" as the server recorded it, or null for a bula. */
  currentArmy: string | null
  disabled?: boolean
  lockNote?: string | null
  /** Half the width of a hero: one of two evenings on the same day (#591). */
  small?: boolean
}) {
  const router = useRouter()
  const [answer, setAnswer] = useState<AttendanceStatus | null>(current)
  const [army, setArmy] = useState<string | null>(currentArmy)
  const [editing, setEditing] = useState(false)
  const [pop, setPop] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  // The pop is a one-shot, and it is cleared on a TIMER rather than on
  // `animationend`: the same tap also starts a `router.refresh()` transition,
  // and an urgent `setPop(false)` landing inside that transition was observed
  // to be rolled back by the transition's own render, leaving the class on
  // forever and the second answer silent. A timer cannot be undone by a
  // re-render, and it clears the flag even where the animation never runs at
  // all (`prefers-reduced-motion`, which turns every animation in `/app` off).
  useEffect(() => {
    if (!pop) return
    const handle = setTimeout(() => setPop(false), 600)
    return () => clearTimeout(handle)
  }, [pop])

  async function send(next: AttendanceStatus) {
    if (disabled || saving) return
    const previous = answer
    const previousArmy = army
    setError(null)
    setAnswer(next)
    setEditing(false)
    setSaving(true)
    try {
      const res = await fetch('/api/app/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceId, memberId, status: next }),
      })
      const body = (await res.json().catch(() => null)) as
        | { error?: string; army?: 'crni' | 'bili' | null }
        | null
      if (!res.ok) {
        setAnswer(previous)
        setArmy(previousArmy)
        setError(body?.error ?? APP_STRINGS.answer.failed)
        return
      }
      // The army the ROUTE decided, never a guess of ours: a voditelj may have
      // moved this dancer for this evening, and the hero has to say which army
      // they are actually counted in.
      setArmy(
        body?.army === 'crni'
          ? APP_STRINGS.ui.armyCrni
          : body?.army === 'bili'
            ? APP_STRINGS.ui.armyBili
            : null,
      )
      setPop(true)
      // The ArmyBar and the row chips are server-rendered, so refresh them once
      // the write landed rather than counting a second time in the browser.
      startTransition(() => router.refresh())
    } catch {
      setAnswer(previous)
      setArmy(previousArmy)
      setError(APP_STRINGS.answer.failed)
    } finally {
      setSaving(false)
    }
  }

  const asking = answer === null || editing

  return (
    <>
      <div className={small ? 'ui-btns ui-btns--small' : 'ui-btns'}>
        {asking ? (
          <>
            <Button
              variant="primary"
              check
              disabled={disabled || saving}
              onClick={() => void send('coming')}
            >
              {APP_STRINGS.answer.coming}
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || saving}
              onClick={() => void send('not_coming')}
            >
              {APP_STRINGS.answer.notComing}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={answer === 'coming' ? 'done' : 'ghost'}
              check={answer === 'coming'}
              pop={pop}
              className={answer === 'coming' ? undefined : 'ui-btn--wide'}
              onClick={() => setEditing(true)}
            >
              {answer === 'coming'
                ? army
                  ? S.comingIn(army)
                  : S.coming
                : S.notComing}
            </Button>
            <Button variant="link" onClick={() => setEditing(true)}>
              {S.change}
            </Button>
          </>
        )}
      </div>
      {lockNote && <p className="app__answer-note">{lockNote}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </>
  )
}
