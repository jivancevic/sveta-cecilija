'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { formatEur } from '@/lib/app/orders-view'
import { ledgerErrorMessage } from '@/lib/app/sales-view'
import { MAX_DISCOUNT_LABEL_LENGTH } from '@/lib/offline-sales/lines'
import { Stepper } from '../../Stepper'

// The blagajna's named actions on one public evening (#502, #476's "named
// actions only").
//
// Five verbs and a link, each one a button with a sheet under it that says what
// is about to happen before it happens. Three of them move money or mail every
// buyer, so none of them is a raw form and none of them is a `confirm()`: on a
// phone that dialog is a wall of system chrome over the page the decision is
// about, and the second tap is the same decision made visibly.
//
// **Every route behind them already existed and is unchanged**, which is the
// point of the ticket: this is a port of the five Backoffice edit-menu items
// (`components/payload/{Cancel,RescheduleShow,MarkMovedToZimsko,InPersonSales,
// ViewOrdersForShow}MenuItem.tsx`) onto a screen a person can open on the pier.
// The one exception is Pauziraj, whose route is new because the pause had none
// (#366 shipped it as a checkbox on the Shows form).
//
// The two-step shape is the routes' own and is kept exactly: GET is a PREVIEW
// that writes nothing and names who is about to be mailed; POST is the claim.
// Cancel and Pomakni datum additionally offer a test send to the caller's own
// inbox, which is the only rehearsal available for an action that cannot be
// undone.
//
// Nothing is optimistic. A cancellation is a Stripe round trip per order and a
// door sale is a transaction; the honest answer exists only after the response,
// and a success calls `router.refresh()` so the numbers above re-render from
// the rows that were just written.

const S = APP_STRINGS.showActions

type Sheet = 'pause' | 'cancel' | 'reschedule' | 'move' | 'door' | null

// ── The route payloads, as the routes already answer them ──────────────────

interface CancelPreview {
  alreadyCancelled: boolean
  date: string
  time: string
  onlineOrders: number
  refundCents: number
  partnerOrders: number
  partnerSeats: number
  compOrders: number
  compSeats: number
  toNotify: number
  noEmail: number
  overDailyMailLimit: boolean
  dailyMailLimit: number
}

interface CancelResult {
  status: 'cancelled' | 'already-cancelled'
  refunded: number
  refundedCents: number
  refundFailed: number
  voided: number
  notified: number
  notifyFailed: number
}

interface ReschedulePreview {
  currentDate: string
  time: string
  buyerCount: number
}

type RescheduleResult =
  | { status: 'rescheduled'; oldDate: string; newDate: string; total: number; sent: number }
  | { status: 'no-op' }
  | { status: 'date-mismatch' }

interface MovePreview {
  alreadyMoved: boolean
  venue: string
  buyerCount: number
}

type MoveResult =
  | { status: 'moved'; total: number; sent: number }
  | { status: 'already-moved' }
  | { status: 'not-applicable' }

interface StoredLine {
  id: number
  source: 'door' | 'legacy'
  ticketType: 'adult' | 'child'
  quantity: number
  unitPriceCents: number
  discountLabel: string | null
}

// ── The sheet ──────────────────────────────────────────────────────────────

/**
 * The confirmation under the buttons: what is about to happen, then the verb
 * and Odustani. In the flow rather than in a modal, for the same reason the
 * order actions are (#501).
 */
function Sheet({
  title,
  error,
  busy,
  confirm,
  confirmLabel,
  danger,
  close,
  closeLabel,
  children,
}: {
  title: string
  error: string | null
  busy: boolean
  /** Null is a sheet that explains why there is nothing to confirm. */
  confirm: (() => void) | null
  confirmLabel: string
  danger?: boolean
  close: () => void
  closeLabel?: string
  children?: React.ReactNode
}) {
  return (
    <div className="app__sheet" role="group" aria-label={title}>
      <p className="app__sheet-title">{title}</p>
      {children}
      {error && <p className="app__error">{error}</p>}
      <div className="app__sheet-buttons">
        {confirm && (
          <button
            type="button"
            className={`app__button${danger ? ' app__button--danger' : ''}`}
            disabled={busy}
            onClick={confirm}
          >
            {busy ? S.working : confirmLabel}
          </button>
        )}
        <button
          type="button"
          className="app__button app__button--link"
          disabled={busy}
          onClick={close}
        >
          {closeLabel ?? S.cancel}
        </button>
      </div>
    </div>
  )
}

// ── The actions ────────────────────────────────────────────────────────────

export function PerformanceActions({
  performanceId,
  paused,
  cancelled,
  atLjetno,
  canRefund,
}: {
  performanceId: string
  paused: boolean
  cancelled: boolean
  /** Only a Ljetno evening can be moved indoors (#94). */
  atLjetno: boolean
  /** `can(viewer, 'refunds')`, applied on the server. Cancelling moves money. */
  canRefund: boolean
}) {
  const router = useRouter()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Previews, each loaded when its sheet opens and thrown away when it closes:
  // a preview is a statement about right now, and keeping one across two
  // openings would show yesterday's buyer count over today's decision.
  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null)
  const [reschedulePreview, setReschedulePreview] = useState<ReschedulePreview | null>(null)
  const [movePreview, setMovePreview] = useState<MovePreview | null>(null)
  const [lines, setLines] = useState<StoredLine[] | null>(null)

  const [newDate, setNewDate] = useState('')
  const [testNote, setTestNote] = useState<string | null>(null)
  const [retry, setRetry] = useState(false)

  // The door form.
  const [source, setSource] = useState<'door' | 'legacy'>('door')
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [discountCount, setDiscountCount] = useState(0)
  const [discountPrice, setDiscountPrice] = useState('')
  const [discountReason, setDiscountReason] = useState('')

  const close = useCallback(() => {
    setSheet(null)
    setError(null)
    setTestNote(null)
    setRetry(false)
    setCancelPreview(null)
    setReschedulePreview(null)
    setMovePreview(null)
    setLines(null)
    setNewDate('')
  }, [])

  /**
   * One request, and the Croatian sentence it can fail with.
   *
   * `translate` is how a ported route gets a sentence a cashier can act on. The
   * routes under `/api/shows/` predate Cecilija and answer `/admin` too, so
   * their `error` field is developer English ("Show not found") and must never
   * reach a phone; the default is therefore one generic sentence. The ledger
   * is the exception and the reason this parameter exists: its refusals are the
   * ones the person can FIX (a price above face value, a missing reason, a
   * correction that takes back more than went in), and "pokušaj ponovno" tells
   * them neither what was wrong nor which number to change. It answers a stable
   * `code`, so the wording is ours and the rule stays the route's.
   */
  async function call<T>(
    url: string,
    init?: RequestInit,
    translate?: (body: { error?: string; code?: string } | null) => string,
  ): Promise<T | null> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, init)
      const body = (await res.json().catch(() => null)) as
        | (T & { error?: string; code?: string })
        | null
      if (!res.ok) {
        if (translate) setError(translate(body))
        // Only the `/app` routes, whose refusals are APP_STRINGS already, are
        // allowed to speak for themselves.
        else setError(url.startsWith('/api/app/') ? (body?.error ?? S.failed) : S.failed)
        return null
      }
      return body as T
    } catch {
      setError(S.failed)
      return null
    } finally {
      setBusy(false)
    }
  }


  async function open(next: Exclude<Sheet, null>) {
    setSheet(next)
    setError(null)
    setDone(null)
    setTestNote(null)
    setRetry(false)

    if (next === 'cancel') {
      setCancelPreview(await call<CancelPreview>(`/api/shows/${performanceId}/cancel`))
    } else if (next === 'reschedule') {
      setReschedulePreview(
        await call<ReschedulePreview>(`/api/shows/${performanceId}/reschedule`),
      )
    } else if (next === 'move') {
      setMovePreview(await call<MovePreview>(`/api/shows/${performanceId}/move-to-indoor`))
    } else if (next === 'door') {
      const body = await call<{ lines: StoredLine[] }>(
        `/api/shows/${performanceId}/offline-sales`,
      )
      setLines(body?.lines ?? [])
    }
  }

  function finish(message: string) {
    setDone(message)
    close()
    router.refresh()
  }

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // ── Pauziraj / Nastavi ───────────────────────────────────────────────────

  async function confirmPause() {
    const body = await call<{ ok: true }>(
      `/api/app/performances/${performanceId}/pause`,
      json({ paused: !paused }),
    )
    if (body) finish(paused ? S.pause.resumed : S.pause.paused)
  }

  // ── Otkaži ───────────────────────────────────────────────────────────────

  async function postCancel(test: boolean) {
    const body = await call<CancelResult & { to?: string }>(
      `/api/shows/${performanceId}/cancel`,
      json({ test }),
    )
    if (!body) return
    if (test) {
      setTestNote(S.reschedule.testSent(body.to ?? ''))
      return
    }
    if (body.refundFailed > 0 || body.notifyFailed > 0) {
      // The documented fix for a half-finished run (#497): press it again.
      setRetry(true)
      router.refresh()
      return
    }
    finish(
      S.cancelShow.done(body.refunded, formatEur(body.refundedCents), body.voided, body.notified),
    )
  }

  // ── Pomakni datum ────────────────────────────────────────────────────────

  async function postReschedule(test: boolean) {
    if (!newDate) {
      setError(S.reschedule.needsDate)
      return
    }
    const body = await call<RescheduleResult & { to?: string }>(
      `/api/shows/${performanceId}/reschedule`,
      json({ newDate, test }),
    )
    if (!body) return
    if (test) {
      setTestNote(S.reschedule.testSent(body.to ?? ''))
      return
    }
    if (body.status === 'no-op') return setError(S.reschedule.noop)
    if (body.status === 'date-mismatch') return setError(S.reschedule.mismatch)
    finish(S.reschedule.done(body.oldDate, body.newDate, body.sent, body.total))
  }

  // ── Preseli u zimsko ─────────────────────────────────────────────────────

  async function confirmMove() {
    const body = await call<MoveResult>(
      `/api/shows/${performanceId}/move-to-indoor`,
      { method: 'POST' },
    )
    if (!body) return
    if (body.status === 'already-moved') return setError(S.move.already)
    if (body.status === 'not-applicable') return setError(S.move.notApplicable)
    finish(S.move.done(body.sent, body.total))
  }

  // ── Prodaja na vratima ───────────────────────────────────────────────────

  async function confirmDoor() {
    const batch: {
      ticketType: 'adult' | 'child'
      quantity: number
      unitPriceCents?: number
      discountLabel?: string
    }[] = []
    if (adults !== 0) batch.push({ ticketType: 'adult', quantity: adults })
    if (children !== 0) batch.push({ ticketType: 'child', quantity: children })
    if (discountCount !== 0) {
      const eur = Number(discountPrice.replace(',', '.'))
      if (discountPrice.trim() === '' || !Number.isFinite(eur) || eur < 0) {
        return setError(S.door.needsPrice)
      }
      if (discountReason.trim() === '') return setError(S.door.needsReason)
      batch.push({
        ticketType: 'adult',
        quantity: discountCount,
        unitPriceCents: Math.round(eur * 100),
        discountLabel: discountReason.trim(),
      })
    }
    if (batch.length === 0) return setError(S.door.empty)

    const body = await call<{ counter: number }>(
      `/api/shows/${performanceId}/offline-sales`,
      json({ source, lines: batch }),
      (body) => ledgerErrorMessage(body?.code),
    )
    if (!body) return
    setAdults(0)
    setChildren(0)
    setDiscountCount(0)
    setDiscountPrice('')
    setDiscountReason('')
    finish(S.door.done(body.counter))
  }

  return (
    <section className="app__acts">
      <h2 className="app__acts-head">{S.title}</h2>
      {done && <p className="app__alarm-result">{done}</p>}

      <div className="app__acts-buttons">
        {!cancelled && (
          <button type="button" className="app__button" onClick={() => open('pause')}>
            {paused ? S.pause.resume : S.pause.pause}
          </button>
        )}
        {!cancelled && (
          <button
            type="button"
            className="app__button app__button--link"
            onClick={() => open('reschedule')}
          >
            {S.reschedule.action}
          </button>
        )}
        {!cancelled && atLjetno && (
          <button
            type="button"
            className="app__button app__button--link"
            onClick={() => open('move')}
          >
            {S.move.action}
          </button>
        )}
        {/* The ledger reaches a PAST evening and a cancelled one: a season is
            backfilled after the fact, and a miscount is corrected later
            (ADR-0025). */}
        <button
          type="button"
          className="app__button app__button--link"
          onClick={() => open('door')}
        >
          {S.door.action}
        </button>
        <Link
          className="app__button app__button--link"
          href={`/app/orders?show=${performanceId}`}
        >
          {APP_STRINGS.sales.ordersLink}
        </Link>
        <button
          type="button"
          className="app__button app__button--danger"
          onClick={() => open('cancel')}
        >
          {S.cancelShow.action}
        </button>
      </div>

      {sheet === 'pause' && (
        <Sheet
          title={paused ? S.pause.resumeTitle : S.pause.pauseTitle}
          error={error}
          busy={busy}
          confirm={confirmPause}
          confirmLabel={S.confirm}
          close={close}
        >
          <p className="app__sheet-body">{paused ? S.pause.resumeBody : S.pause.pauseBody}</p>
        </Sheet>
      )}

      {sheet === 'cancel' && (
        <Sheet
          title={S.cancelShow.title}
          error={error}
          busy={busy}
          confirm={canRefund && cancelPreview ? () => void postCancel(false) : null}
          confirmLabel={S.cancelShow.confirm}
          danger
          close={close}
          closeLabel={S.cancelShow.keep}
        >
          {busy && !cancelPreview && <p className="app__sheet-body">{S.loading}</p>}
          {cancelPreview && (
            <>
              {cancelPreview.alreadyCancelled && (
                <p className="app__sheet-warn">{S.cancelShow.already}</p>
              )}
              <p className="app__sheet-body">
                {S.cancelShow.lead(cancelPreview.date, cancelPreview.time)}
              </p>
              <ul className="app__sheet-list">
                <li>
                  {S.cancelShow.refunds(
                    formatEur(cancelPreview.refundCents),
                    cancelPreview.onlineOrders,
                  )}
                </li>
                <li>
                  {S.cancelShow.voids(cancelPreview.partnerSeats, cancelPreview.compSeats)}
                </li>
                <li>{S.cancelShow.mails(cancelPreview.toNotify, cancelPreview.noEmail)}</li>
              </ul>
              {cancelPreview.overDailyMailLimit && (
                <p className="app__sheet-warn">
                  {S.cancelShow.overLimit(cancelPreview.dailyMailLimit)}
                </p>
              )}
              {!canRefund && <p className="app__sheet-warn">{S.cancelShow.needsRefunds}</p>}
              {retry && <p className="app__sheet-warn">{S.cancelShow.retry}</p>}
              {testNote && <p className="app__alarm-result">{testNote}</p>}
              {canRefund && (
                <button
                  type="button"
                  className="app__button app__button--quiet"
                  disabled={busy}
                  onClick={() => void postCancel(true)}
                >
                  {S.reschedule.test}
                </button>
              )}
            </>
          )}
        </Sheet>
      )}

      {sheet === 'reschedule' && (
        <Sheet
          title={S.reschedule.title}
          error={error}
          busy={busy}
          confirm={reschedulePreview ? () => void postReschedule(false) : null}
          confirmLabel={S.reschedule.confirm}
          danger
          close={close}
        >
          {busy && !reschedulePreview && <p className="app__sheet-body">{S.loading}</p>}
          {reschedulePreview && (
            <>
              <p className="app__sheet-body">
                {S.reschedule.lead(
                  reschedulePreview.currentDate,
                  reschedulePreview.time,
                  reschedulePreview.buyerCount,
                )}
              </p>
              <label className="app__perf-field" htmlFor="reschedule-date">
                <span>{S.reschedule.newDate}</span>
                <input
                  id="reschedule-date"
                  className="app__input"
                  type="date"
                  value={newDate}
                  disabled={busy}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </label>
              {testNote && <p className="app__alarm-result">{testNote}</p>}
              <button
                type="button"
                className="app__button app__button--quiet"
                disabled={busy || !newDate}
                onClick={() => void postReschedule(true)}
              >
                {S.reschedule.test}
              </button>
            </>
          )}
        </Sheet>
      )}

      {sheet === 'move' && (
        <Sheet
          title={S.move.title}
          error={error}
          busy={busy}
          confirm={movePreview && !movePreview.alreadyMoved ? confirmMove : null}
          confirmLabel={S.move.confirm}
          close={close}
        >
          {busy && !movePreview && <p className="app__sheet-body">{S.loading}</p>}
          {movePreview && (
            <p className="app__sheet-body">
              {movePreview.alreadyMoved
                ? S.move.already
                : movePreview.venue !== 'ljetno-kino'
                  ? S.move.notApplicable
                  : S.move.lead(movePreview.buyerCount)}
            </p>
          )}
        </Sheet>
      )}

      {sheet === 'door' && (
        <Sheet
          title={S.door.title}
          error={error}
          busy={busy}
          confirm={confirmDoor}
          confirmLabel={S.door.confirm}
          close={close}
        >
          <p className="app__sheet-body">{S.door.hint}</p>

          {lines !== null && lines.length > 0 && (
            <div className="app__ledger">
              <p className="app__ledger-head">{S.door.recorded}</p>
              {lines.map((line) => (
                <p className="app__ledger-line" key={line.id}>
                  {line.quantity > 0 ? '+' : ''}
                  {line.quantity} ×{' '}
                  {line.ticketType === 'child'
                    ? APP_STRINGS.orders.detail.child
                    : APP_STRINGS.orders.detail.adult}{' '}
                  {formatEur(line.unitPriceCents)}
                  {line.discountLabel ? ` (${line.discountLabel})` : ''}
                  {line.source === 'legacy' ? ` · ${S.door.sourceLegacy}` : ''}
                </p>
              ))}
              <p className="app__ledger-hint">{S.door.recordedHint}</p>
            </div>
          )}

          <label className="app__perf-field" htmlFor="door-source">
            <span>{S.door.sourceLabel}</span>
            <select
              id="door-source"
              className="app__select"
              value={source}
              disabled={busy}
              onChange={(e) => setSource(e.target.value as 'door' | 'legacy')}
            >
              <option value="door">{S.door.sourceDoor}</option>
              <option value="legacy">{S.door.sourceLegacy}</option>
            </select>
          </label>

          <Stepper
            label={S.door.adults}
            value={adults}
            min={-999}
            max={999}
            bigStep={10}
            onChange={setAdults}
            disabled={busy}
          />
          <Stepper
            label={S.door.children}
            value={children}
            min={-999}
            max={999}
            bigStep={10}
            onChange={setChildren}
            disabled={busy}
          />

          <p className="app__sheet-sub">{S.door.discountHead}</p>
          <Stepper
            label={S.door.discountCount}
            value={discountCount}
            min={-999}
            max={999}
            bigStep={10}
            onChange={setDiscountCount}
            disabled={busy}
          />
          <label className="app__perf-field" htmlFor="door-price">
            <span>{S.door.discountPrice}</span>
            <input
              id="door-price"
              className="app__input"
              type="text"
              inputMode="decimal"
              value={discountPrice}
              disabled={busy}
              placeholder="15"
              onChange={(e) => setDiscountPrice(e.target.value)}
            />
          </label>
          <label className="app__perf-field" htmlFor="door-reason">
            <span>{S.door.discountReason}</span>
            <input
              id="door-reason"
              className="app__input"
              type="text"
              maxLength={MAX_DISCOUNT_LABEL_LENGTH}
              value={discountReason}
              disabled={busy}
              placeholder={S.door.discountReasonPlaceholder}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
          </label>
        </Sheet>
      )}
    </section>
  )
}
