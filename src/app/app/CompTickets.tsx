'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { MAX_SELF_COMP_NAME } from '@/lib/comp/self-comp'
import type { CompView } from '@/lib/app/detail-loaders'

// "Besplatne karte" — a moreškant's own free tickets (#434, stories 47 to 51).
//
// Two steppers and one button, because that is the whole decision: how many
// adults, how many children, whose name on the slip. The remaining allowance is
// shown next to the steppers ("još 2 od 4") and the steppers stop at it, so the
// cap is visible BEFORE the tap rather than explained after it — the server
// still refuses over the cap, inside the seat lock, and this is only the
// courtesy half of that rule.
//
// Nothing here is optimistic: tickets are issued, mailed and given a QR code by
// the server, so the honest answer only exists after the round trip. A success
// calls `router.refresh()` and the server re-renders "Moje karte" from the rows
// it just wrote, which is why this component keeps no list of its own.

function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (next: number) => void
}) {
  return (
    <div className="app__stepper">
      <span className="app__stepper-label">{label}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} -`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        -
      </button>
      <span className="app__stepper-value">{value}</span>
      <button
        type="button"
        className="app__stepper-button"
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

export function CompTickets({
  performanceId,
  comps,
}: {
  performanceId: string
  comps: CompView
}) {
  const router = useRouter()
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [name, setName] = useState(comps.defaultName)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requested = adults + children
  const left = Math.max(0, comps.remaining - requested)

  async function post(url: string, body: unknown, failure: string, ok: (b: unknown) => void) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const parsed = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string; emailStatus?: string }
        | null
      if (!res.ok || !parsed?.ok) {
        setError(parsed?.error ?? failure)
        return
      }
      ok(parsed)
      // The section above is server-rendered from the orders that now exist.
      router.refresh()
    } catch {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  function issue() {
    if (requested === 0) {
      setError(APP_STRINGS.comp.pickOne)
      return
    }
    void post(
      '/api/app/comp/issue',
      { performanceId, adults, children, buyerName: name },
      APP_STRINGS.comp.failed,
      (body) => {
        const status = (body as { emailStatus?: string }).emailStatus
        setMessage(status === 'sent' ? APP_STRINGS.comp.issued : APP_STRINGS.comp.issuedNoEmail)
        setAdults(0)
        setChildren(0)
      },
    )
  }

  function cancel(orderId: string) {
    void post('/api/app/comp/cancel', { orderId }, APP_STRINGS.comp.cancelFailed, () =>
      setMessage(APP_STRINGS.comp.cancelled),
    )
  }

  return (
    <section className="app__comp">
      <h2 className="app__army-head">
        <span>{APP_STRINGS.comp.title}</span>
        <span className="app__chip">{APP_STRINGS.comp.remaining(comps.remaining)}</span>
      </h2>
      <p className="app__comp-intro">{APP_STRINGS.comp.intro}</p>

      {comps.orders.length > 0 && (
        <ul className="app__comp-orders">
          <li className="app__comp-total">{APP_STRINGS.comp.mine(comps.issued)}</li>
          {comps.orders.map((order) => (
            <li key={order.orderId} className="app__comp-order">
              <span className="app__comp-code">
                {order.code} · {order.tickets}
              </span>
              {order.canCancel ? (
                <button
                  type="button"
                  className="app__button app__button--quiet"
                  disabled={busy}
                  onClick={() => cancel(order.orderId)}
                >
                  {busy ? APP_STRINGS.comp.cancelling : APP_STRINGS.comp.cancel}
                </button>
              ) : (
                <span className="app__comp-note">{APP_STRINGS.comp.scanned}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {comps.remaining === 0 ? (
        <p className="app__empty">{APP_STRINGS.comp.capReached}</p>
      ) : (
        <>
          <div className="app__comp-steppers">
            <Stepper
              label={APP_STRINGS.comp.adults}
              value={adults}
              max={adults + left}
              onChange={setAdults}
            />
            <Stepper
              label={APP_STRINGS.comp.children}
              value={children}
              max={children + left}
              onChange={setChildren}
            />
          </div>
          <label className="app__comp-name" htmlFor="comp-name">
            {APP_STRINGS.comp.nameLabel}
          </label>
          <input
            id="comp-name"
            className="app__input"
            type="text"
            maxLength={MAX_SELF_COMP_NAME}
            placeholder={APP_STRINGS.comp.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="app__button"
            disabled={busy || requested === 0}
            onClick={issue}
          >
            {busy ? APP_STRINGS.comp.issuing : APP_STRINGS.comp.issue}
          </button>
        </>
      )}

      {message && <p className="app__alarm-result">{message}</p>}
      {error && <p className="app__answer-error">{error}</p>}
    </section>
  )
}
