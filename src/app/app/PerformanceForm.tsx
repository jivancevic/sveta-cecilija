'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS, KIND_LABELS } from '@/lib/app/strings'
import { MAX_PLACE_LENGTH, NON_PUBLIC_KINDS, VENUES, type NonPublicKind } from '@/lib/performance-input'
import { SHOWN_KINDS, type PerformanceKind } from '@/lib/show-performance'
import { VENUE_LABEL, type Venue } from '@/lib/venues'
import { Button } from './ui/Button'

// Dodaj / Uredi / Otkaži an izvedba, from a phone (#503, #502).
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
// Since #502 the same form serves the blagajna, and the shape of an evening is
// what changes with the tick box: a PUBLIC izvedba has a house (and so a
// capacity) and may be a Redovna; a booking has a free-text place and a
// client and may never be one. Which half a person is offered comes from their
// permissions, and the route re-checks it against the body.

/** The five fields of a booking (#503). */
export interface PerformanceFormValues {
  kind: NonPublicKind
  date: string
  time: string
  location: string
  client: string
}

/** The four fields of a public evening (#502). */
export interface PublicFormValues {
  kind: PerformanceKind
  date: string
  time: string
  venue: Venue
}

const EMPTY: PerformanceFormValues = {
  kind: 'dmc',
  date: '',
  time: '',
  location: '',
  client: '',
}

const EMPTY_PUBLIC: PublicFormValues = {
  kind: 'redovna',
  date: '',
  time: '',
  venue: 'ljetno-kino',
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

/**
 * The public evening's fields: when, where, and what kind of night it is.
 *
 * The date is here on a CREATE and absent from the editor below, which is the
 * whole difference between the two: a new evening needs a day, and moving an
 * existing one mails every buyer, so that is its own action (#379).
 */
function PublicFields({
  idPrefix,
  values,
  onChange,
  disabled,
  withDate,
  venueLocked,
}: {
  idPrefix: string
  values: PublicFormValues
  onChange: (next: PublicFormValues) => void
  disabled: boolean
  withDate: boolean
  /**
   * Seats have been sold, so the house is not a field any more (#502 review).
   * The select goes read-only and says which action moves it, because the route
   * refuses the change with the same sentence and a control that looks editable
   * until the save is a control that lies.
   */
  venueLocked?: boolean
}) {
  const set = <K extends keyof PublicFormValues>(key: K, value: PublicFormValues[K]) =>
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
          onChange={(e) => set('kind', e.target.value as PerformanceKind)}
        >
          {SHOWN_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>

      <div className="app__perf-when">
        {withDate && (
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
        )}
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

      <label className="app__perf-field" htmlFor={`${idPrefix}-venue`}>
        <span>{APP_STRINGS.performance.venue}</span>
        <select
          id={`${idPrefix}-venue`}
          className="app__select"
          value={values.venue}
          disabled={disabled || venueLocked === true}
          onChange={(e) => set('venue', e.target.value as Venue)}
        >
          {VENUES.map((venue) => (
            <option key={venue} value={venue}>
              {VENUE_LABEL.hr[venue]}
            </option>
          ))}
        </select>
        {venueLocked && (
          <i className="app__perf-locked">{APP_STRINGS.performance.venueLocked}</i>
        )}
      </label>
    </div>
  )
}

/** POST the fields, and hand back the server's sentence when it refuses. */
async function submit(
  url: string,
  method: 'POST' | 'PATCH',
  values: Record<string, unknown>,
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
 * "Dodaj izvedbu" on the Izvedbe list, for whichever halves the reader holds.
 *
 * Closed until it is asked for: the screen a voditelj opens twenty times a week
 * is the agenda, and a form permanently sitting above it would push the next
 * evening off the first screenful.
 *
 * Since #567 both halves of Izvedbe may write BOTH kinds (Q53), so the tick box
 * is what the form is now: a season's schedule is one job, and which SHAPE an
 * evening has (a house and a capacity, or a place and a client) is a fact about
 * the evening rather than about who is typing it. `defaultPublic` only decides
 * which shape the form opens on — the one this reader enters most.
 */
export function AddPerformance({
  canPublic,
  canBooking,
  defaultPublic,
}: {
  /** May add a public evening, which sells seats. */
  canPublic: boolean
  /** May add a booking, which sells none. */
  canBooking: boolean
  /** Which shape the form opens on; the blagajna's is the public evening. */
  defaultPublic?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPublic, setIsPublic] = useState((defaultPublic ?? canPublic) && canPublic)
  const [values, setValues] = useState<PerformanceFormValues>(EMPTY)
  const [publicValues, setPublicValues] = useState<PublicFormValues>(EMPTY_PUBLIC)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!canPublic && !canBooking) return null

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setError(null)
    const body = isPublic ? { ...publicValues, isPublic: true } : { ...values, isPublic: false }
    const result = await submit('/api/app/performances', 'POST', body)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(APP_STRINGS.performance.added)
    setValues(EMPTY)
    setPublicValues(EMPTY_PUBLIC)
    setOpen(false)
    // The new evening belongs in the agenda above, in its month; the server
    // renders that, so ask it again rather than splicing a row in here.
    router.refresh()
  }

  if (!open) {
    return (
      <section className="app__perf-add">
        <Button
          variant="ghost"
          onClick={() => {
            setMessage(null)
            setOpen(true)
          }}
        >
          + {APP_STRINGS.performance.add}
        </Button>
        {message && <p className="app__alarm-result">{message}</p>}
      </section>
    )
  }

  return (
    <section className="app__perf-add app__perf-add--open">
      <h2 className="app__perf-head">{APP_STRINGS.performance.addTitle}</h2>

      {canPublic && canBooking && (
        <label className="app__perf-switch" htmlFor="add-is-public">
          <input
            id="add-is-public"
            type="checkbox"
            checked={isPublic}
            disabled={busy}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          <span>{APP_STRINGS.performance.isPublic}</span>
        </label>
      )}

      {isPublic ? (
        <PublicFields
          idPrefix="add-public"
          values={publicValues}
          onChange={setPublicValues}
          disabled={busy}
          withDate
        />
      ) : (
        <Fields idPrefix="add" values={values} onChange={setValues} disabled={busy} />
      )}

      <div className="app__perf-actions">
        <Button variant="primary" disabled={busy} onClick={save}>
          {busy ? APP_STRINGS.performance.adding : APP_STRINGS.performance.add}
        </Button>
        <Button
          variant="link"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
        >
          {APP_STRINGS.performance.close}
        </Button>
      </div>
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}

/**
 * "Uredi izvedbu" on a PUBLIC evening (#502): the hour, the house and the kind.
 *
 * Three fields and not four. The date is missing on purpose and its absence is
 * the design: moving a public evening mails every buyer and reissues every
 * ticket, so it is "Pomakni datum" next door, with a preview and a test send,
 * rather than a field a thumb can nudge while fixing a typo in the start time.
 */
export function PublicPerformanceEditor({
  performanceId,
  initial,
  venueLocked,
}: {
  performanceId: string
  initial: PublicFormValues
  /** Active tickets exist: the house moves through "Preseli u zimsko" instead. */
  venueLocked: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<PublicFormValues>(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setError(null)
    const result = await submit(`/api/app/performances/${performanceId}`, 'PATCH', {
      time: values.time,
      kind: values.kind,
      venue: values.venue,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMessage(APP_STRINGS.performance.saved)
    setOpen(false)
    router.refresh()
  }

  return (
    <section className="app__perf-edit">
      {open ? (
        <>
          <h3 className="app__perf-head">{APP_STRINGS.performance.editTitle}</h3>
          <PublicFields
            idPrefix="edit-public"
            values={values}
            onChange={setValues}
            disabled={busy}
            withDate={false}
            venueLocked={venueLocked}
          />
          <div className="app__perf-actions">
            <Button variant="primary" disabled={busy} onClick={save}>
              {busy ? APP_STRINGS.performance.saving : APP_STRINGS.performance.save}
            </Button>
            <Button
              variant="link"
              disabled={busy}
              onClick={() => {
                setValues(initial)
                setOpen(false)
                setError(null)
              }}
            >
              {APP_STRINGS.performance.close}
            </Button>
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
      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}

/**
 * "Uredi izvedbu" and "Otkaži izvedbu", in the voditelj's tools card.
 *
 * Rendered for a NON-public performance, whose five fields include its date.
 * A public evening gets the three-field editor above, because moving its date
 * mails every buyer and is its own named action (#379).
 *
 * **Uredi is either half's since #567; Otkaži here is still the voditelj's**
 * (Q53). `POST …/[id]/cancel` flips a status and mails nobody, because a
 * booking sells no ticket, and it stayed `moreska` when the two write routes
 * were widened — so a `tickets` holder who enters a cruise call may correct it
 * and hands the calling-off back to the voditelj, which is who the ship rings.
 *
 * Otkaži is two taps rather than a browser dialog: `confirm()` on a phone is a
 * wall of system chrome, and the second tap is the same decision made visibly.
 */
export function PerformanceEditor({
  performanceId,
  initial,
  cancelled,
  canCancel,
}: {
  performanceId: string
  initial: PerformanceFormValues
  cancelled: boolean
  /** `moreska`: the route refuses everybody else, so nobody else is offered it. */
  canCancel: boolean
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
    const result = await submit(`/api/app/performances/${performanceId}`, 'PATCH', { ...values })
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

  // A cancelled booking has no controls, only the sentence saying so. Uredi is
  // refused by the route with a 409 (moving it would push "premještena" at a
  // roster that was told the evening is off) and Otkaži has nothing left to do,
  // so offering either would be offering a dead end.
  if (cancelled) {
    return (
      <section className="app__perf-edit">
        <p className="app__lead-note">{APP_STRINGS.performance.cancelledNotEditable}</p>
      </section>
    )
  }

  return (
    <section className="app__perf-edit">
      {open ? (
        <>
          <h3 className="app__perf-head">{APP_STRINGS.performance.editTitle}</h3>
          <Fields idPrefix="edit" values={values} onChange={setValues} disabled={busy} />
          <div className="app__perf-actions">
            <Button variant="primary" disabled={busy} onClick={save}>
              {busy ? APP_STRINGS.performance.saving : APP_STRINGS.performance.save}
            </Button>
            <Button
              variant="link"
              disabled={busy}
              onClick={() => {
                setValues(initial)
                setOpen(false)
                setError(null)
              }}
            >
              {APP_STRINGS.performance.close}
            </Button>
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

      {!canCancel ? null : arming ? (
        <div className="app__perf-confirm">
          <p>{APP_STRINGS.performance.cancelConfirm}</p>
          <div className="app__perf-actions">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={cancelShow}
            >
              {busy ? APP_STRINGS.performance.cancelling : APP_STRINGS.performance.cancelYes}
            </Button>
            <Button variant="link" disabled={busy} onClick={() => setArming(false)}>
              {APP_STRINGS.performance.cancelNo}
            </Button>
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
