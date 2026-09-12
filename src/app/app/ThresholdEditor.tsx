'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { MAX_THRESHOLD } from '@/lib/app/performance-form'

// "Pragovi" — how many crni and how many bili this evening needs (#408, #503).
//
// Two steppers, the same control the comp tickets use, and deliberately NOT a
// native number input: on a phone that is a pair of 12px spinner arrows next to
// a keyboard that covers the page, for an answer that is always a small whole
// number. The steppers stop at 0 and at `MAX_THRESHOLD`, which is the same
// range the route enforces, so the cap is visible before the tap rather than
// explained after it.
//
// Nothing is optimistic: the headcount chips on the page above are rendered by
// the server against these numbers, so a save calls `router.refresh()` and the
// two cannot disagree. This is the one voditelj control that belongs on a
// PUBLIC evening too — a Redovna needs its two armies like any other night.

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  disabled: boolean
}) {
  return (
    <div className="app__stepper">
      <span className="app__stepper-label">{label}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} -`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
      >
        -
      </button>
      <span className="app__stepper-value">{value}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} +`}
        disabled={disabled || value >= MAX_THRESHOLD}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

export function ThresholdEditor({
  performanceId,
  crni: initialCrni,
  bili: initialBili,
}: {
  performanceId: string
  crni: number
  bili: number
}) {
  const router = useRouter()
  const [crni, setCrni] = useState(initialCrni)
  const [bili, setBili] = useState(initialBili)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dirty = crni !== initialCrni || bili !== initialBili

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/app/performances/${performanceId}/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crni, bili }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: true; error?: string } | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? APP_STRINGS.thresholds.failed)
        return
      }
      setMessage(APP_STRINGS.thresholds.saved)
      router.refresh()
    } catch {
      setError(APP_STRINGS.thresholds.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="app__thresholds">
      <h3 className="app__perf-head">{APP_STRINGS.thresholds.title}</h3>
      <p className="app__perf-hint">{APP_STRINGS.thresholds.hint}</p>
      <div className="app__comp-steppers">
        <Stepper
          label={APP_STRINGS.detail.crni}
          value={crni}
          onChange={setCrni}
          disabled={saving}
        />
        <Stepper
          label={APP_STRINGS.detail.bili}
          value={bili}
          onChange={setBili}
          disabled={saving}
        />
      </div>
      <button
        type="button"
        className="app__button"
        disabled={saving || !dirty}
        onClick={save}
      >
        {saving ? APP_STRINGS.thresholds.saving : APP_STRINGS.thresholds.save}
      </button>
      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}
