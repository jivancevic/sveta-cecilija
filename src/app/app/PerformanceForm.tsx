'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS, KIND_LABELS } from '@/lib/app/strings'
import { MAX_PLACE_LENGTH, NON_PUBLIC_KINDS, type NonPublicKind } from '@/lib/performance-input'

// Dodaj / Uredi / Otkaži an izvedba, from a phone (#503).
//
// Branimir enters next month's cruise call standing on the pier, so the form is
// five fields and a button, each one a control a thumb can hit: a native date
// and time picker (the OS ones are the best on a phone and there is nothing to
// improve on), a select for the kind, two text fields for where and for whom.
//
// Neither form is optimistic and neither keeps a copy of the schedule: the
// server owns the answer, and a success calls `router.refresh()` so the list or
// the detail header re-renders from the row that was just written. A form that
// showed its own idea of the evening would be a second schedule.
//
// The kind list comes from `NON_PUBLIC_KINDS`, so `redovna` is not offered
// anywhere: a public show sells tickets and is born in the Backoffice. The
// route refuses it too.

/** The five fields both forms share. */
export interface PerformanceFormValues {
  kind: NonPublicKind
  date: string
  time: string
  location: string
  client: string
}

const EMPTY: PerformanceFormValues = {
  kind: 'dmc',
  date: '',
  time: '',
  location: '',
  client: '',
}

function Fields({
  idPrefix,
  values,
  onChange,
  disabled,
}: {
  /** Ids have to be unique on the page: the detail view can show two forms. */
  idPrefix: string
  values: PerformanceFormValues
  onChange: (next: PerformanceFormValues) => void
  disabled: boolean
}) {
  const set = <K extends keyof PerformanceFormValues>(key: K, value: PerformanceFormValues[K]) =>
    onChange({ ...values, [key]: value })

  return (
    <div className="app__perf-fields">
      <label className="app__perf-field" htmlFor={`${idPrefix}-kind`}>
        <span>{APP_STRINGS.performance.kind}</span>
        <select
          id={`${idPrefix}-kind`}
          className="app__select"
          value={values.kind}
          disabled={disabled}
          onChange={(e) => set('kind', e.target.value as NonPublicKind)}
        >
          {NON_PUBLIC_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>

      <div className="app__perf-when">
        <label className="app__perf-field" htmlFor={`${idPrefix}-date`}>
          <span>{APP_STRINGS.performance.date}</span>
          <input
            id={`${idPrefix}-date`}
            className="app__input"
            type="date"
            value={values.date}
            disabled={disabled}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>
        <label className="app__perf-field" htmlFor={`${idPrefix}-time`}>
          <span>{APP_STRINGS.performance.time}</span>
          <input
            id={`${idPrefix}-time`}
            className="app__input"
            type="time"
            value={values.time}
            disabled={disabled}
            onChange={(e) => set('time', e.target.value)}
          />
        </label>
      </div>

      <label className="app__perf-field" htmlFor={`${idPrefix}-location`}>
        <span>{APP_STRINGS.performance.location}</span>
        <input
          id={`${idPrefix}-location`}
          className="app__input"
          type="text"
          maxLength={MAX_PLACE_LENGTH}
          placeholder={APP_STRINGS.performance.locationPlaceholder}
          value={values.location}
          disabled={disabled}
          onChange={(e) => set('location', e.target.value)}
        />
      </label>

      <label className="app__perf-field" htmlFor={`${idPrefix}-client`}>
        <span>
          {APP_STRINGS.performance.client}
          <i>{APP_STRINGS.performance.clientOptional}</i>
        </span>
        <input
          id={`${idPrefix}-client`}
          className="app__input"
          type="text"
          maxLength={MAX_PLACE_LENGTH}
          placeholder={APP_STRINGS.performance.clientPlaceholder}
          value={values.client}
          disabled={disabled}
          onChange={(e) => set('client', e.target.value)}
        />
      </label>
    </div>
  )
}

/** POST the five fields, and hand back the server's sentence when it refuses. */
async function submit(
  url: string,
  method: 'POST' | 'PATCH',
  values: PerformanceFormValues,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    const body = (await res.json().catch(() => null)) as { ok?: true; error?: string } | null
    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? APP_STRINGS.performance.failed }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: APP_STRINGS.performance.failed }
  }
}

/**
 * "Dodaj izvedbu" on the Izvedbe list.
 *
 * Closed until it is asked for: the screen a voditelj opens twenty times a week
 * is the agenda, and a form permanently sitting above it would push the next
 * evening off the first screenful.
 */
export function AddPerformance() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<PerformanceFormValues>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setError(null)
    const result = await submit('/api/app/performances', 'POST', values)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(APP_STRINGS.performance.added)
    setValues(EMPTY)
    setOpen(false)
    // The new evening belongs in the agenda above, in its month; the server
    // renders that, so ask it again rather than splicing a row in here.
    router.refresh()
  }

  if (!open) {
    return (
      <section className="app__perf-add">
        <button
          type="button"
          className="app__button app__button--quiet"
          onClick={() => {
            setMessage(null)
            setOpen(true)
          }}
        >
          + {APP_STRINGS.performance.add}
        </button>
        {message && <p className="app__alarm-result">{message}</p>}
      </section>
    )
  }

  return (
    <section className="app__perf-add app__perf-add--open">
      <h2 className="app__perf-head">{APP_STRINGS.performance.addTitle}</h2>
      <Fields idPrefix="add" values={values} onChange={setValues} disabled={busy} />
      <div className="app__perf-actions">
        <button type="button" className="app__button" disabled={busy} onClick={save}>
          {busy ? APP_STRINGS.performance.adding : APP_STRINGS.performance.add}
        </button>
        <button
          type="button"
          className="app__button app__button--quiet"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          {APP_STRINGS.performance.close}
        </button>
      </div>
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}

/**
 * "Uredi izvedbu" and "Otkaži izvedbu", in the voditelj's tools card.
 *
 * Rendered only for a NON-public performance, because that is the only kind
 * whose date, place and status are a voditelj's (the routes refuse the rest).
 * A public evening gets one quiet sentence instead, on the detail page.
 *
 * Otkaži is two taps rather than a browser dialog: `confirm()` on a phone is a
 * wall of system chrome, and the second tap is the same decision made visibly.
 */
export function PerformanceEditor({
  performanceId,
  initial,
  cancelled,
}: {
  performanceId: string
  initial: PerformanceFormValues
  cancelled: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<PerformanceFormValues>(initial)
  const [busy, setBusy] = useState(false)
  const [arming, setArming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setError(null)
    const result = await submit(`/api/app/performances/${performanceId}`, 'PATCH', values)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(APP_STRINGS.performance.saved)
    setOpen(false)
    router.refresh()
  }

  async function cancelShow() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/app/performances/${performanceId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = (await res.json().catch(() => null)) as { ok?: true; error?: string } | null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? APP_STRINGS.performance.failed)
        return
      }
      setArming(false)
      setMessage(APP_STRINGS.performance.cancelled)
      router.refresh()
    } catch {
      setError(APP_STRINGS.performance.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app__perf-edit">
      {open ? (
        <>
          <h3 className="app__perf-head">{APP_STRINGS.performance.editTitle}</h3>
          <Fields idPrefix="edit" values={values} onChange={setValues} disabled={busy} />
          <div className="app__perf-actions">
            <button type="button" className="app__button" disabled={busy} onClick={save}>
              {busy ? APP_STRINGS.performance.saving : APP_STRINGS.performance.save}
            </button>
            <button
              type="button"
              className="app__button app__button--quiet"
              disabled={busy}
              onClick={() => {
                setValues(initial)
                setOpen(false)
                setError(null)
              }}
            >
              {APP_STRINGS.performance.close}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="app__lead-row"
          onClick={() => {
            setMessage(null)
            setOpen(true)
          }}
        >
          {APP_STRINGS.performance.edit} ›
        </button>
      )}

      {cancelled ? (
        <p className="app__lead-note">{APP_STRINGS.performance.alreadyCancelled}</p>
      ) : arming ? (
        <div className="app__perf-confirm">
          <p>{APP_STRINGS.performance.cancelConfirm}</p>
          <div className="app__perf-actions">
            <button
              type="button"
              className="app__button app__button--danger"
              disabled={busy}
              onClick={cancelShow}
            >
              {busy ? APP_STRINGS.performance.cancelling : APP_STRINGS.performance.cancelYes}
            </button>
            <button
              type="button"
              className="app__button app__button--quiet"
              disabled={busy}
              onClick={() => setArming(false)}
            >
              {APP_STRINGS.performance.cancelNo}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="app__lead-row" onClick={() => setArming(true)}>
          {APP_STRINGS.performance.cancelAction} ›
        </button>
      )}

      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}
