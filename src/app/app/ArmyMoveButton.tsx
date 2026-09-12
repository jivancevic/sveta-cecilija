'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import type { Army } from '@/lib/attendance/rules'

// "Prebaci u Bili" — the voditelj's army move (#423, #419 story 12).
//
// Only rendered for a dancer who holds BOTH armies and is coming; the route
// refuses the move anyway if the roles do not cover the target, so the control
// being hidden is convenience, not the rule.
//
// It posts the same `coming` answer with an `army`, through the one answer
// route: there is no second writer of an attendance row.

export function ArmyMoveButton({
  performanceId,
  memberId,
  target,
}: {
  performanceId: string
  memberId: string
  target: Army
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  async function move() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/app/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performanceId, memberId, status: 'coming', army: target }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(body?.error ?? APP_STRINGS.answer.failed)
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError(APP_STRINGS.answer.failed)
    } finally {
      setSaving(false)
    }
  }

  const label = target === 'crni' ? APP_STRINGS.detail.crni : APP_STRINGS.detail.bili

  return (
    <>
      <button type="button" className="app__move" disabled={saving} onClick={move}>
        {APP_STRINGS.detail.moveTo(label)}
      </button>
      {error && <span className="app__answer-error">{error}</span>}
    </>
  )
}
