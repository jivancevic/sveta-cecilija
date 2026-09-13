'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saleTotalCents, stepperMax, type SellOption } from '@/lib/app/partner-screen'
import { formatEur } from '@/lib/app/orders-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { Stepper } from '../Stepper'
import { DrainBanner } from '../DrainBanner'

// The sell form of Prodaja (#505), ported from `PartnerSellForm`.
//
// Same flow, same guarantees: the counts go to `/api/partner/sell`, which does
// the seat maths again inside the per-show advisory lock, and the combined
// ticket PDF is opened the moment the route answers so the clerk can print it
// while the guest is still at the desk. The steppers' ceiling is the courtesy
// half of the capacity rule, not the rule itself.
//
// The form does NOT unmount on success (that was the #241 revamp and it
// stands): a banner appears above it, the counts reset, and the next sale can
// start on the same tap rhythm. `router.refresh()` re-renders the server half
// of the screen, so the new order shows up in Zadnje prodaje and in the month
// card without a reload.

const BANNER_MS = 10000

interface SaleDone {
  orderId: string
  code: string
  ticketCount: number
}

export function SellForm({ shows }: { shows: SellOption[] }) {
  const router = useRouter()
  const [showId, setShowId] = useState(shows.find((s) => !s.soldOut)?.id ?? shows[0]?.id ?? '')
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<SaleDone | null>(null)

  const selected = shows.find((s) => s.id === showId)
  const remaining = selected?.remaining ?? 0
  const total = adults + children
  const canSubmit = !!showId && total > 0 && total <= remaining && !busy

  const dismiss = useCallback(() => setDone(null), [])

  const openPdf = (orderId: string) =>
    window.open(`/api/orders/${orderId}/tickets.pdf`, '_blank', 'noopener')

  async function submit() {
    // The button is disabled until there is something to sell, so there is no
    // "you picked nothing" message to write: the control says it instead.
    if (busy || total === 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, adults, children }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        orderId?: string
        code?: string
        ticketCount?: number
      }
      if (!res.ok || !body.orderId) {
        setError(res.status === 409 ? APP_STRINGS.sell.tooMany : APP_STRINGS.sell.failed)
        return
      }
      openPdf(body.orderId)
      setDone({
        orderId: body.orderId,
        code: body.code ?? '',
        ticketCount: body.ticketCount ?? total,
      })
      setAdults(0)
      setChildren(0)
      router.refresh()
    } catch {
      setError(APP_STRINGS.sell.network)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app__sell">
      <h2 className="app__month-head">
        <span>{APP_STRINGS.sell.formTitle}</span>
      </h2>

      {done && (
        <DrainBanner ms={BANNER_MS} onDone={dismiss} tone="good">
          <div className="app__sell-done">
            <b>{APP_STRINGS.sell.doneTitle}</b>
            <span>{APP_STRINGS.sell.doneBody(done.ticketCount, done.code)}</span>
            <button
              type="button"
              className="app__button app__button--link"
              onClick={() => openPdf(done.orderId)}
            >
              {APP_STRINGS.sell.openPdf}
            </button>
          </div>
        </DrainBanner>
      )}

      {shows.length === 0 ? (
        <p className="app__empty">{APP_STRINGS.sell.noShows}</p>
      ) : (
        <>
          <label className="app__comp-name" htmlFor="sell-show">
            {APP_STRINGS.sell.show}
          </label>
          <select
            id="sell-show"
            className="app__select app__select--wide"
            value={showId}
            onChange={(e) => {
              setShowId(e.target.value)
              setError(null)
            }}
          >
            {shows.map((s) => (
              <option key={s.id} value={s.id} disabled={s.soldOut}>
                {s.label} ·{' '}
                {s.soldOut ? APP_STRINGS.sell.soldOut : APP_STRINGS.sell.seatsLeft(s.remaining)}
              </option>
            ))}
          </select>

          <div className="app__comp-steppers">
            <Stepper
              label={APP_STRINGS.sell.adults}
              value={adults}
              max={stepperMax(remaining, children)}
              disabled={busy}
              onChange={setAdults}
            />
            <Stepper
              label={APP_STRINGS.sell.children}
              value={children}
              max={stepperMax(remaining, adults)}
              disabled={busy}
              onChange={setChildren}
            />
          </div>

          <div className="app__sell-total">
            <span>{total}</span>
            <b>{formatEur(saleTotalCents(adults, children))}</b>
          </div>

          {error && <p className="app__error">{error}</p>}

          <button type="button" className="app__button" disabled={!canSubmit} onClick={submit}>
            {busy ? APP_STRINGS.sell.issuing : APP_STRINGS.sell.issue}
          </button>
        </>
      )}
    </section>
  )
}
