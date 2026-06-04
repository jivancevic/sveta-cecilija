'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { RecentSalePageRow } from '@/lib/partner/recent-sales-page'

// Merged "Recent sales" for the partner dashboard (revamp). Collapses the old
// split of a separate same-day "Today's sales" storno panel and a read-only
// recent list into ONE list: the newest 5, with "Show more" paging the rest
// from /api/partner/sales. A sale made today (Europe/Zagreb) is expandable to
// its per-person tickets, each cancellable, plus "Cancel whole sale"; older
// sales are flat read-only rows (outside the same-day storno window). Every
// cancel carries an inline "Sure? Yes/No" confirm — voiding frees a seat and
// drops the ticket from the monthly invoice. Cancels reuse /api/partner/storno
// (server re-checks ownership + the same-day window); on success we mark the
// row locally and router.refresh() so the month-to-date / season cards resync.
type Page = { sales: RecentSalePageRow[]; hasMore: boolean }

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`

export function PartnerRecentSales({ initial, lang }: { initial: Page; lang: AdminLang }) {
  const router = useRouter()
  const [sales, setSales] = React.useState(initial.sales)
  const [hasMore, setHasMore] = React.useState(initial.hasMore)
  const [page, setPage] = React.useState(1)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Resync from the server whenever the dashboard re-renders (a new sale in the
  // sell form, or a cancel here, triggers router.refresh()). Collapses back to
  // the newest page, which is what the partner wants to see after either. Done
  // via the "adjust state during render" pattern (React docs) rather than an
  // effect, which the React Compiler lint disallows.
  const [lastInitial, setLastInitial] = React.useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setSales(initial.sales)
    setHasMore(initial.hasMore)
    setPage(1)
  }

  const toggle = (orderId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })

  const loadMore = async () => {
    setLoadingMore(true)
    setError(null)
    try {
      const next = page + 1
      const res = await fetch(`/api/partner/sales?page=${next}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(adminT(lang, 'cancelFailed'))
        return
      }
      setSales((prev) => [...prev, ...((data.sales as RecentSalePageRow[]) ?? [])])
      setHasMore(Boolean(data.hasMore))
      setPage(next)
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setLoadingMore(false)
    }
  }

  const cancel = async (orderId: string, ticketId?: string) => {
    const key = ticketId ? `${orderId}:${ticketId}` : orderId
    setBusy(key)
    setConfirming(null)
    setError(null)
    try {
      const res = await fetch('/api/partner/storno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketId ? { orderId, ticketId } : { orderId }),
      })
      if (!res.ok) {
        await res.json().catch(() => undefined)
        setError(adminT(lang, 'cancelFailed'))
        return
      }
      // Optimistic update: mark the cancelled ticket(s), then drop the order
      // entirely once it has no active tickets left (a whole-sale cancel, or the
      // last per-ticket cancel) so a cancelled sale disappears from the list.
      // router.refresh() resyncs the authoritative state (the server query also
      // excludes orders with zero active tickets, so it stays gone).
      setSales((prev) => {
        const mapped = prev.map((s) =>
          s.orderId !== orderId
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
        )
        const target = mapped.find((s) => s.orderId === orderId)
        const noneActive = !!target && target.tickets.every((t) => t.status !== 'active')
        return noneActive ? mapped.filter((s) => s.orderId !== orderId) : mapped
      })
      router.refresh()
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setBusy(null)
    }
  }

  if (sales.length === 0) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>{adminT(lang, 'recentSales')}</h2>
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
          {adminT(lang, 'noSalesYet')}
        </p>
      </div>
    )
  }

  // The "Earlier" divider sits before the first non-today (read-only) sale.
  const firstOlderIdx = sales.findIndex((s) => !s.isToday)

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{adminT(lang, 'recentSales')}</h2>
      <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '0 0 14px' }}>
        {adminT(lang, 'recentCancelNote')}
      </p>

      {error && (
        <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sales.map((sale, idx) => {
          const divider =
            !sale.isToday && idx === firstOlderIdx ? (
              <div style={earlierLabel}>{adminT(lang, 'earlierSales')}</div>
            ) : null
          return (
            <React.Fragment key={sale.orderId}>
              {divider}
              {sale.isToday ? (
                <TodaySaleRow
                  sale={sale}
                  lang={lang}
                  open={expanded.has(sale.orderId)}
                  onToggle={() => toggle(sale.orderId)}
                  busy={busy}
                  confirming={confirming}
                  setConfirming={setConfirming}
                  onCancel={cancel}
                />
              ) : (
                <OlderSaleRow sale={sale} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loadingMore} style={showMoreBtn}>
          {loadingMore ? adminT(lang, 'loadingMore') : adminT(lang, 'showMore')}
        </button>
      )}
    </div>
  )
}

function TodaySaleRow({
  sale,
  lang,
  open,
  onToggle,
  busy,
  confirming,
  setConfirming,
  onCancel,
}: {
  sale: RecentSalePageRow
  lang: AdminLang
  open: boolean
  onToggle: () => void
  busy: string | null
  confirming: string | null
  setConfirming: (key: string | null) => void
  onCancel: (orderId: string, ticketId?: string) => void
}) {
  const activeCount = sale.tickets.filter((t) => t.status === 'active').length
  const count = sale.adultCount + sale.childCount
  const saleBusy = busy === sale.orderId

  return (
    <div style={saleRowBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onToggle} style={expandBtn} aria-expanded={open}>
          <span style={{ width: 12, display: 'inline-block' }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontWeight: 700 }}>{sale.code}</span>
          <span style={{ color: 'var(--theme-elevation-500)', fontSize: 12 }}>
            {sale.soldAt} · {sale.showLabel}
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            {count} · {eur(sale.totalCents)}
          </span>
          <CancelControl
            cKey={sale.orderId}
            label={adminT(lang, 'cancelSale')}
            disabled={activeCount === 0}
            busy={saleBusy}
            lang={lang}
            confirming={confirming}
            setConfirming={setConfirming}
            onConfirm={() => onCancel(sale.orderId)}
          />
        </div>
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {sale.tickets.map((t) => {
            const cancelled = t.status !== 'active'
            const typeLabel = t.type === 'child' ? adminT(lang, 'typeChild') : adminT(lang, 'typeAdult')
            return (
              <div key={t.id} style={ticketRow}>
                <span style={{ fontSize: 13, color: cancelled ? 'var(--theme-elevation-400)' : 'var(--theme-text)' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.ref}</span>{' '}
                  <span style={{ color: 'var(--theme-elevation-500)' }}>· {typeLabel}</span>
                  {cancelled && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--theme-error-500, #c0392b)' }}>
                      {adminT(lang, 'statusCancelled')}
                    </span>
                  )}
                </span>
                {!cancelled && (
                  <CancelControl
                    cKey={`${sale.orderId}:${t.id}`}
                    label={adminT(lang, 'cancelTicketAction')}
                    link
                    busy={busy === `${sale.orderId}:${t.id}`}
                    lang={lang}
                    confirming={confirming}
                    setConfirming={setConfirming}
                    onConfirm={() => onCancel(sale.orderId, t.id)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OlderSaleRow({ sale }: { sale: RecentSalePageRow }) {
  const count = sale.adultCount + sale.childCount
  const date = sale.createdAt
    ? new Date(sale.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Europe/Zagreb',
      })
    : ''
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '4px 2px' }}>
      <span style={{ fontSize: 13 }}>
        <span style={{ color: 'var(--theme-elevation-500)' }}>{date}</span>{' '}
        <span style={{ fontWeight: 700 }}>{sale.code}</span>{' '}
        <span style={{ color: 'var(--theme-elevation-500)', fontSize: 12 }}>· {sale.showLabel}</span>
      </span>
      <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
        {count} · {eur(sale.totalCents)}
      </span>
    </div>
  )
}

// Inline-confirm cancel control: first click reveals "Sure? Yes / No"; only the
// Yes actually voids. Shared by the whole-sale button and the per-ticket link.
function CancelControl({
  cKey,
  label,
  disabled = false,
  busy,
  link = false,
  lang,
  confirming,
  setConfirming,
  onConfirm,
}: {
  cKey: string
  label: string
  disabled?: boolean
  busy: boolean
  link?: boolean
  lang: AdminLang
  confirming: string | null
  setConfirming: (key: string | null) => void
  onConfirm: () => void
}) {
  if (busy) {
    return <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>{adminT(lang, 'cancelling')}</span>
  }
  if (confirming === cKey) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--theme-elevation-600)' }}>{adminT(lang, 'confirmSure')}</span>
        <button type="button" onClick={onConfirm} style={confirmYesBtn}>
          {adminT(lang, 'confirmYes')}
        </button>
        <button type="button" onClick={() => setConfirming(null)} style={confirmNoBtn}>
          {adminT(lang, 'confirmNo')}
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(cKey)}
      style={disabled ? dangerDisabled : link ? dangerLink : dangerBtn}
    >
      {label}
    </button>
  )
}

const card: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 20,
}
const saleRowBox: React.CSSProperties = {
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: 12,
}
const expandBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--theme-text)',
  fontSize: 14,
  textAlign: 'left',
}
const ticketRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '4px 0',
}
const earlierLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: 'var(--theme-elevation-400)',
  borderTop: '1px solid var(--theme-elevation-150)',
  paddingTop: 10,
  marginTop: 2,
}
const showMoreBtn: React.CSSProperties = {
  marginTop: 14,
  padding: '8px 14px',
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
const dangerBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--theme-error-500, #c0392b)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
}
const dangerDisabled: React.CSSProperties = {
  ...dangerBtn,
  background: 'var(--theme-elevation-150)',
  color: 'var(--theme-elevation-400)',
  cursor: 'not-allowed',
}
const dangerLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--theme-error-500, #c0392b)',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  padding: '2px 4px',
}
const confirmYesBtn: React.CSSProperties = {
  padding: '4px 10px',
  background: 'var(--theme-error-500, #c0392b)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
}
const confirmNoBtn: React.CSSProperties = {
  padding: '4px 10px',
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
}
