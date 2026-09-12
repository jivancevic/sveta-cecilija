'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { MAX_BUYER_EMAIL, MAX_BUYER_NAME } from '@/lib/app/orders-buyer'

// The four named actions of one order (#501, #476's "named actions only").
//
// Each is a button with a verb on it and a confirmation under it, never a raw
// form: Povrat moves real money, Pošalji ulaznice ponovno sends real mail, and
// a mis-tap on a phone held in one hand at a gate is the normal case rather
// than the unlucky one. The sheet states the consequence in a sentence and
// names the amount or the address it is about to use.
//
// Three of the four call routes that already existed and are already guarded
// (`/api/orders/[id]/refund`, `…/resend-ticket-email`, `…/tickets.pdf`): this
// is a port, so the behaviour, the idempotency and the audit stay exactly where
// they are. The fourth, Uredi kupca, is the one new route (#501) and the only
// thing on this screen that writes to an order.
//
// Nothing here is optimistic. A refund is a Stripe round trip and an edit runs
// the Orders hooks, so the honest answer only exists after the response; a
// success calls `router.refresh()` and the server re-renders the facts above.

const S = APP_STRINGS.orders

type Sheet = 'refund' | 'resend' | 'edit' | null

export function OrderActions({
  orderId,
  refund,
  amount,
  email,
  buyerName,
}: {
  orderId: string
  /** From `refundOffer()`: the server has already applied `can(viewer, 'refunds')`. */
  refund: 'hidden' | 'available' | 'already' | 'not-payable'
  /** The formatted total, which is what the refund confirmation names. */
  amount: string
  email: string | null
  buyerName: string
}) {
  const router = useRouter()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [name, setName] = useState(buyerName)
  const [address, setAddress] = useState(email ?? '')

  function open(next: Sheet) {
    setSheet(next)
    setError(null)
    setDone(null)
  }

  /**
   * One request, and the Croatian sentence it can fail with.
   *
   * `failure` is a FUNCTION of the status rather than a string, because the
   * three routes answer differently and two of them answer in English: the
   * refund and the resend predate Cecilija and serve `/admin` too, so their
   * `error` field is developer text ("Order has no Stripe payment intent") and
   * must never reach a phone at the door. Only the `/app` route, whose refusals
   * are APP_STRINGS to begin with, is allowed to speak for itself.
   */
  async function call(
    url: string,
    init: RequestInit,
    success: string,
    failure: (status: number, body: { error?: string } | null) => string,
  ): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, init)
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(failure(res.status, body))
        return false
      }
      setDone(success)
      setSheet(null)
      router.refresh()
      return true
    } catch {
      // A network failure has no status; 0 is the shape every mapper handles.
      setError(failure(0, null))
      return false
    } finally {
      setBusy(false)
    }
  }

  const confirmRefund = () =>
    void call(`/api/orders/${orderId}/refund`, { method: 'POST' }, S.refund.done, (status) =>
      // 404 is the order, not the refund: a stale tab on a deleted row.
      status === 404 ? S.detail.missing : S.refund.failed,
    )

  const confirmResend = () =>
    void call(
      `/api/orders/${orderId}/resend-ticket-email`,
      { method: 'POST' },
      S.resend.done,
      // The route's own two outcomes: 400 is "no address on file", which has a
      // repair the reader can make, and everything else is "it did not send".
      (status) => (status === 400 ? S.resend.noEmail : S.resend.failed),
    )

  const confirmEdit = () =>
    void call(
      `/api/app/orders/${orderId}/buyer`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerName: name, email: address }),
      },
      S.edit.done,
      // This one IS ours: its refusals are the Croatian sentences in
      // `orders-buyer.ts`, and they name the field that was wrong.
      (_status, body) => body?.error ?? S.edit.failed,
    )

  return (
    <section className="app__order-actions">
      {done && <p className="app__order-done">{done}</p>}

      <div className="app__order-buttons">
        {refund === 'available' && (
          <button
            type="button"
            className="app__button app__button--danger"
            onClick={() => open('refund')}
          >
            {S.actions.refund}
          </button>
        )}
        {refund === 'already' && <p className="app__order-note">{S.refund.already}</p>}
        {refund === 'not-payable' && <p className="app__order-note">{S.refund.notPayable}</p>}

        <button type="button" className="app__button" onClick={() => open('resend')}>
          {S.actions.resend}
        </button>

        {/* A file, so an anchor: the PDF route answers with the ticket sheet and
            the phone opens it in whatever it opens PDFs in. */}
        <a
          className="app__button app__button--link"
          href={`/api/orders/${orderId}/tickets.pdf`}
          target="_blank"
          rel="noreferrer"
        >
          {S.actions.pdf}
        </a>

        <button
          type="button"
          className="app__button app__button--link"
          onClick={() => open('edit')}
        >
          {S.actions.edit}
        </button>
      </div>

      {sheet === 'refund' && (
        <Sheet
          title={S.refund.title}
          body={S.refund.body(amount)}
          error={error}
          busy={busy}
          confirm={confirmRefund}
          close={() => setSheet(null)}
          danger
        />
      )}

      {sheet === 'resend' && (
        <Sheet
          title={S.resend.title}
          body={email ? S.resend.body(email) : S.resend.noEmail}
          error={error}
          busy={busy}
          confirm={email ? confirmResend : null}
          close={() => setSheet(null)}
        />
      )}

      {sheet === 'edit' && (
        <Sheet
          title={S.edit.title}
          body={S.edit.body}
          error={error}
          busy={busy}
          confirm={confirmEdit}
          close={() => setSheet(null)}
        >
          <label className="app__field">
            <span>{S.edit.nameLabel}</span>
            <input
              type="text"
              value={name}
              maxLength={MAX_BUYER_NAME}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="app__field">
            <span>{S.edit.emailLabel}</span>
            <input
              type="email"
              value={address}
              maxLength={MAX_BUYER_EMAIL}
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <p className="app__order-hint">{S.edit.emailHint}</p>
        </Sheet>
      )}
    </section>
  )
}

/**
 * The confirmation under the buttons: what is about to happen, then Potvrdi and
 * Odustani. Not a modal — it sits in the flow where the thumb already is, and a
 * dialog on a phone at a gate is one more thing that can land under a finger.
 *
 * `confirm: null` is a sheet that explains why there is nothing to confirm (an
 * order with no address to mail to), so the refusal is read in the same place
 * the action would have been.
 */
function Sheet({
  title,
  body,
  error,
  busy,
  confirm,
  close,
  danger,
  children,
}: {
  title: string
  body: string
  error: string | null
  busy: boolean
  confirm: (() => void) | null
  close: () => void
  danger?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="app__order-sheet" role="group" aria-label={title}>
      <p className="app__order-sheet-title">{title}</p>
      <p className="app__order-sheet-body">{body}</p>
      {children}
      {error && <p className="app__error">{error}</p>}
      <div className="app__order-sheet-buttons">
        {confirm && (
          <button
            type="button"
            className={`app__button${danger ? ' app__button--danger' : ''}`}
            disabled={busy}
            onClick={confirm}
          >
            {busy ? S.actions.working : S.actions.confirm}
          </button>
        )}
        <button
          type="button"
          className="app__button app__button--link"
          disabled={busy}
          onClick={close}
        >
          {S.actions.cancel}
        </button>
      </div>
    </div>
  )
}
