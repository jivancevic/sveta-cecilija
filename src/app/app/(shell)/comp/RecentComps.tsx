'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { CompOrderRow, CompTicket } from '@/lib/comp/comp-report'
import { compVoidCounts } from '@/lib/comp/cancel-comp'
import { ordersHref } from '@/lib/app/orders-query'
import { shortShowDay } from '@/lib/app/partner-screen'
import { APP_STRINGS, shortMonthLabel } from '@/lib/app/strings'
import { Button, Card, Section } from '../../ui'
import { compVoidOrderBody, useCompVoid } from '../../use-comp-void'

// "Zadnji gratisi" (#506): the list a comp is voided from.
//
// Poništi is a CONFIRMATION, not the partner's delete-then-undo, and that is a
// decision about the route rather than about taste: `/api/comp/cancel` has no
// undo endpoint, so a bar that drains would offer a way back that does not
// exist. The sheet names what is about to stop working and says the void cannot
// be taken back, in the same shape `OrderActions` uses on Narudžbe.
//
// A voided comp stays on the list, struck through. The secretary needs to see
// that the thing she just cancelled is cancelled; a row that vanished would
// read as a comp that was never issued.
//
// A SCANNED ticket carries no trash (#701): somebody came in on it, so the
// route refuses to void it, and a whole-order void leaves it standing — which
// the confirmation says in numbers. The request itself is `useCompVoid`, shared
// with the comp order on Narudžbe. The list is the newest eight; the rest are
// one link away, on Narudžbe's Gratis filter, where there is a search and a
// pager.

const S = APP_STRINGS.gratis

type Target = { orderId: string; ticketId?: string; order: CompOrderRow; ticket: CompTicket | null }

/** Narudžbe, filtered to comps: where every comp older than the eight lives. */
const ALL_COMPS = ordersHref({ q: '', showId: null, state: 'comp', page: 1 })

/** "17. srp 14:32" — when the comp was issued, in Zagreb time. */
function issuedAt(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // en-CA plus the Zagreb zone is the only locale-stable way to get the LOCAL
  // calendar day out of an instant.
  const [, month, day] = d
    .toLocaleDateString('en-CA', { timeZone: 'Europe/Zagreb' })
    .split('-')
    .map(Number)
  const clock = d.toLocaleTimeString('hr-HR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zagreb',
  })
  return `${day}. ${shortMonthLabel(month)} ${clock}`
}

export function RecentComps({ initial }: { initial: CompOrderRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const { target, busy, error, done, ask: askVoid, close, confirm } = useCompVoid<Target>()

  const toggle = (orderId: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })

  const ask = (order: CompOrderRow, ticket: CompTicket | null) =>
    askVoid({ orderId: order.orderId, ticketId: ticket?.id, order, ticket })

  return (
    <section className="app__comp-recent">
      <Section title={S.recentTitle} />

      {done && <p className="app__done">{done}</p>}

      {initial.length === 0 ? (
        <Card className="app__empty">
          <p>{S.recentEmpty}</p>
        </Card>
      ) : (
        <ul className="app__sale-list">
          {initial.map((order) => {
            const expanded = open.has(order.orderId)
            const people = order.tickets.length
            const counts = compVoidCounts(order.tickets)
            return (
              <li key={order.orderId} className="app__sale">
                <div className="app__sale-row">
                  <button
                    type="button"
                    className="app__sale-head"
                    aria-expanded={expanded}
                    onClick={() => toggle(order.orderId)}
                  >
                    <b>{order.memberName ?? S.noMember}</b>
                    <span className="app__sale-meta">
                      <span title={S.issuedAt}>{issuedAt(order.createdAt)}</span> ·{' '}
                      <span title={S.performance}>{shortShowDay(order.showDate)}</span> ·{' '}
                      <span title={S.people}>{people}</span> · {order.code}
                    </span>
                  </button>
                  <div className="app__sale-actions">
                    <a
                      className="app__icon-button"
                      href={`/api/orders/${order.orderId}/tickets.pdf`}
                      target="_blank"
                      rel="noopener"
                      title={S.downloadTickets}
                      aria-label={S.downloadTickets}
                    >
                      <DownloadIcon />
                    </a>
                    {counts.voidable > 0 ? (
                      <button
                        type="button"
                        className="app__icon-button app__icon-button--warn"
                        onClick={() => ask(order, null)}
                        title={S.cancelOrder}
                        aria-label={S.cancelOrder}
                      >
                        <TrashIcon />
                      </button>
                    ) : order.activeCount === 0 ? (
                      <span className="app__badge app__badge--refunded">{S.allCancelled}</span>
                    ) : null}
                  </div>
                </div>

                {expanded && (
                  <ul className="app__ticket-list">
                    {order.tickets.map((t) => (
                      <li key={t.id} className="app__ticket-row">
                        <span
                          className={
                            t.cancelled ? 'app__ticket-ref app__ticket-ref--off' : 'app__ticket-ref'
                          }
                        >
                          {t.ref} · {t.type === 'child' ? S.typeChild : S.typeAdult}
                          {t.cancelled && ` · ${S.statusCancelled}`}
                          {!t.cancelled && t.scanned && ` · ${S.statusScanned}`}
                        </span>
                        {!t.cancelled && !t.scanned && (
                          <button
                            type="button"
                            className="app__icon-button app__icon-button--warn"
                            onClick={() => ask(order, t)}
                            title={S.cancelTicket}
                            aria-label={S.cancelTicket}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </li>
                    ))}
                    <li className="app__ticket-row app__comp-holder">
                      {order.buyerName ?? S.noHolder}
                      {order.email ? ` · ${order.email}` : ''}
                    </li>
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {target && (
        <Card
          className="app__confirm"
          role="group"
          aria-label={target.ticket ? S.confirmTicketTitle : S.confirmOrderTitle}
        >
          <b>{target.ticket ? S.confirmTicketTitle : S.confirmOrderTitle}</b>
          <p>
            {target.ticket
              ? S.confirmTicketBody(target.ticket.ref)
              : compVoidOrderBody(target.order.code, compVoidCounts(target.order.tickets))}
          </p>
          {error && <p className="app__error">{error}</p>}
          <div className="ui-btns">
            <Button variant="destructive" disabled={busy} onClick={confirm}>
              {busy ? S.cancelling : S.confirm}
            </Button>
            <Button variant="link" disabled={busy} onClick={close}>
              {S.cancel}
            </Button>
          </div>
        </Card>
      )}

      {error && !target && <p className="app__error">{error}</p>}

      {initial.length > 0 && (
        <Link className="app__fact-link app__comp-all" href={ALL_COMPS}>
          {S.allComps} →
        </Link>
      )}
    </section>
  )
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  )
}
