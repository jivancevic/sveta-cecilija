'use client'

import { Fragment, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RecentSalePageRow } from '@/lib/partner/recent-sales-page'
import { shortShowDay } from '@/lib/app/partner-screen'
import { formatEur } from '@/lib/app/orders-view'
import { APP_STRINGS, shortMonthLabel } from '@/lib/app/strings'
import { DrainBanner } from '../../DrainBanner'
import { Button, Card, Section } from '../../ui'

// "Zadnje prodaje" (#505), ported from `PartnerRecentSales`.
//
// The three newest orders are server-rendered; "Prikaži više" opens a ten-per
// -page pager over the whole history (`/api/partner/sales`). An order sold
// TODAY (Europe/Zagreb, decided in SQL) expands to its per-person tickets and
// carries the cancel; an older one is out of the storno window, so it carries
// only the ticket download.
//
// Cancel is delete-then-undo (ADR-0017): no confirm dialog. The tap voids
// immediately through `/api/partner/cancel` and a quiet banner offers the way
// back for six seconds on an order, four on a single ticket — the same timings
// the Backoffice used, because a clerk who learned them is the same person.
// The undo goes to `/api/partner/cancel/undo`, which re-takes the seats under
// the sell lock and refuses with SEAT_TAKEN if they were resold meanwhile.
//
// T1's heading, card and buttons since #574. The sale row keeps its own markup:
// it opens into its tickets and carries two icon actions, which is more than a
// `ListRow` says by design.

const COLLAPSED_SIZE = 3
const PAGER_SIZE = 10
const ORDER_UNDO_MS = 6000
const TICKET_UNDO_MS = 4000

export interface RecentPage {
  sales: RecentSalePageRow[]
  hasMore: boolean
}

type View = RecentPage & { page: number; mode: 'collapsed' | 'pager' }
type Undo = { orderId: string; ticketId?: string; label: string; ms: number }

/** "17. srp 14:32" — when the sale was rung up, in Zagreb time. */
function soldAt(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // en-CA + the Zagreb zone yields YYYY-MM-DD, which is the only locale-stable
  // way to get the LOCAL calendar day out of an instant.
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


export function RecentSales({ initial }: { initial: RecentPage }) {
  const router = useRouter()
  const [view, setView] = useState<View>({ ...initial, page: 1, mode: 'collapsed' })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<Undo | null>(null)

  // Resync the collapsed view after a router.refresh() (a new sale, a cancel),
  // but never yank the reader out of the pager. "Adjust state during render".
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    if (view.mode === 'collapsed') setView({ ...initial, page: 1, mode: 'collapsed' })
  }

  // A whole-order storno empties the order, and the server list only carries
  // orders with an active ticket left — so refreshing while the undo is still
  // on screen would pull the row out from under the offer. The refresh waits
  // for the bar to drain (or is dropped when the undo actually happens).
  const refreshWhenUndoEnds = useRef(false)
  const dismissUndo = useCallback(() => {
    setUndo(null)
    if (refreshWhenUndoEnds.current) {
      refreshWhenUndoEnds.current = false
      router.refresh()
    }
  }, [router])

  const toggle = (orderId: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })

  async function load(mode: View['mode'], page: number) {
    setLoading(true)
    setError(null)
    try {
      const size = mode === 'collapsed' ? COLLAPSED_SIZE : PAGER_SIZE
      const res = await fetch(`/api/partner/sales?page=${page}&size=${size}`)
      const body = (await res.json().catch(() => ({}))) as {
        sales?: RecentSalePageRow[]
        hasMore?: boolean
      }
      if (!res.ok) {
        setError(APP_STRINGS.sell.failed)
        return
      }
      setView({ sales: body.sales ?? [], hasMore: body.hasMore === true, page, mode })
    } catch {
      setError(APP_STRINGS.sell.network)
    } finally {
      setLoading(false)
    }
  }

  async function cancel(sale: RecentSalePageRow, ticketId?: string) {
    const key = ticketId ? `${sale.orderId}:${ticketId}` : sale.orderId
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/partner/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketId ? { orderId: sale.orderId, ticketId } : { orderId: sale.orderId }),
      })
      if (!res.ok) {
        setError(APP_STRINGS.sell.cancelFailed)
        return
      }
      // Optimistic: the void is already committed, so strike the rows in place
      // and offer the way back. The server is re-read on undo either way.
      const ref = ticketId ? (sale.tickets.find((t) => t.id === ticketId)?.ref ?? sale.code) : sale.code
      setView((v) => ({
        ...v,
        sales: v.sales.map((s) =>
          s.orderId !== sale.orderId
            ? s
            : {
                ...s,
                tickets: s.tickets.map((t) =>
                  ticketId
                    ? t.id === ticketId
                      ? { ...t, status: 'cancelled' }
                      : t
                    : { ...t, status: 'cancelled' },
                ),
              },
        ),
      }))
      setUndo(
        ticketId
          ? { orderId: sale.orderId, ticketId, label: APP_STRINGS.sell.ticketCancelled(ref), ms: TICKET_UNDO_MS }
          : { orderId: sale.orderId, label: APP_STRINGS.sell.orderCancelled(sale.code), ms: ORDER_UNDO_MS },
      )
      // A single ticket leaves the order standing, so the other cards can be
      // brought up to date at once; a whole order waits (see the ref above).
      if (ticketId) router.refresh()
      else refreshWhenUndoEnds.current = true
    } catch {
      setError(APP_STRINGS.sell.network)
    } finally {
      setBusy(null)
    }
  }

  async function doUndo() {
    if (!undo) return
    const { orderId, ticketId } = undo
    setUndo(null)
    refreshWhenUndoEnds.current = false
    setError(null)
    try {
      const res = await fetch('/api/partner/cancel/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketId ? { orderId, ticketId } : { orderId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string }
        setError(
          body.code === 'SEAT_TAKEN' ? APP_STRINGS.sell.undoSeatTaken : APP_STRINGS.sell.undoFailed,
        )
        return
      }
      await load(view.mode, view.page)
      router.refresh()
    } catch {
      setError(APP_STRINGS.sell.undoFailed)
    }
  }

  const sales = view.sales
  const firstOlder = sales.findIndex((s) => !s.isToday)

  return (
    <section className="app__partner-sales">
      <Section title={APP_STRINGS.sell.recentTitle} aside={APP_STRINGS.sell.recentNote} />

      {undo && (
        <DrainBanner key={`${undo.orderId}:${undo.ticketId ?? ''}`} ms={undo.ms} onDone={dismissUndo}>
          <div className="app__sell-done">
            <span>{undo.label}</span>
            <Button variant="link" onClick={() => void doUndo()}>
              {APP_STRINGS.sell.undo}
            </Button>
          </div>
        </DrainBanner>
      )}

      {error && <p className="app__error">{error}</p>}

      {sales.length === 0 ? (
        <Card className="app__empty">
          <p>{APP_STRINGS.sell.recentEmpty}</p>
        </Card>
      ) : (
        <ul className="app__sale-list">
          {sales.map((sale, i) => {
            const expanded = open.has(sale.orderId)
            const active = sale.tickets.filter((t) => t.status === 'active').length
            const head = (
              <>
                <b>{sale.code}</b>
                {/* Three numbers in a row need naming; on a laptop the title
                    is the whole explanation, and it costs a phone nothing. */}
                <span className="app__sale-meta">
                  <span title={APP_STRINGS.sell.sold}>{soldAt(sale.createdAt)}</span> ·{' '}
                  <span title={APP_STRINGS.sell.performance}>{shortShowDay(sale.showDate)}</span> ·{' '}
                  <span title={APP_STRINGS.sell.people}>{sale.adultCount + sale.childCount}</span>
                </span>
                <span className="app__sale-money">{formatEur(sale.totalCents)}</span>
              </>
            )
            return (
              <Fragment key={sale.orderId}>
                {!sale.isToday && i === firstOlder && (
                  <li className="app__sale-divider">{APP_STRINGS.sell.earlier}</li>
                )}
                <li className="app__sale">
                  <div className="app__sale-row">
                    {sale.isToday ? (
                      <button
                        type="button"
                        className="app__sale-head"
                        aria-expanded={expanded}
                        onClick={() => toggle(sale.orderId)}
                      >
                        {head}
                      </button>
                    ) : (
                      <span className="app__sale-head">{head}</span>
                    )}
                    <div className="app__sale-actions">
                      <a
                        className="app__icon-button"
                        href={`/api/orders/${sale.orderId}/tickets.pdf`}
                        target="_blank"
                        rel="noopener"
                        title={APP_STRINGS.sell.downloadTickets}
                        aria-label={APP_STRINGS.sell.downloadTickets}
                      >
                        <DownloadIcon />
                      </a>
                      {sale.isToday && (
                        <button
                          type="button"
                          className="app__icon-button app__icon-button--warn"
                          disabled={active === 0 || busy === sale.orderId}
                          onClick={() => cancel(sale)}
                          title={APP_STRINGS.sell.cancelOrder}
                          aria-label={
                            busy === sale.orderId
                              ? APP_STRINGS.sell.cancelling
                              : APP_STRINGS.sell.cancelOrder
                          }
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </div>

                  {sale.isToday && expanded && (
                    <ul className="app__ticket-list">
                      {sale.tickets.map((t) => {
                        const cancelled = t.status !== 'active'
                        return (
                          <li key={t.id} className="app__ticket-row">
                            <span className={cancelled ? 'app__ticket-ref app__ticket-ref--off' : 'app__ticket-ref'}>
                              {t.ref} ·{' '}
                              {t.type === 'child'
                                ? APP_STRINGS.sell.typeChild
                                : APP_STRINGS.sell.typeAdult}
                              {cancelled && ` · ${APP_STRINGS.sell.statusCancelled}`}
                            </span>
                            {!cancelled && (
                              <button
                                type="button"
                                className="app__icon-button app__icon-button--warn"
                                disabled={busy === `${sale.orderId}:${t.id}`}
                                onClick={() => cancel(sale, t.id)}
                                title={APP_STRINGS.sell.cancelTicket}
                                aria-label={
                                  busy === `${sale.orderId}:${t.id}`
                                    ? APP_STRINGS.sell.cancelling
                                    : APP_STRINGS.sell.cancelTicket
                                }
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              </Fragment>
            )
          })}
        </ul>
      )}

      <Controls
        view={view}
        loading={loading}
        onMore={() => load('pager', 1)}
        onLess={() => load('collapsed', 1)}
        onPage={(p) => load('pager', p)}
      />
    </section>
  )
}

function Controls({
  view,
  loading,
  onMore,
  onLess,
  onPage,
}: {
  view: View
  loading: boolean
  onMore: () => void
  onLess: () => void
  onPage: (page: number) => void
}) {
  if (view.mode === 'collapsed') {
    if (!view.hasMore) return null
    return (
      <Button variant="ghost" disabled={loading} onClick={onMore}>
        {loading ? APP_STRINGS.sell.loading : APP_STRINGS.sell.showMore}
      </Button>
    )
  }
  return (
    <div className="app__pager">
      <button
        type="button"
        className="app__icon-button"
        disabled={loading || view.page <= 1}
        onClick={() => onPage(view.page - 1)}
        aria-label={APP_STRINGS.sell.prevPage}
      >
        ‹
      </button>
      <span className="app__pager-page">{view.page}</span>
      <button
        type="button"
        className="app__icon-button"
        disabled={loading || !view.hasMore}
        onClick={() => onPage(view.page + 1)}
        aria-label={APP_STRINGS.sell.nextPage}
      >
        ›
      </button>
      <Button variant="link" disabled={loading} onClick={onLess}>
        {APP_STRINGS.sell.showLess}
      </Button>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  )
}
