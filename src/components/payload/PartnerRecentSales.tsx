'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { RecentSalePageRow } from '@/lib/partner/recent-sales-page'

// Merged "Recent orders" for the partner dashboard (revamp). One list of the
// partner's orders (newest 5 + "Show more" paging /api/partner/sales). Each order
// is a dense row: code, when sold (clock), show date (calendar), people, money,
// a download-tickets action, and — for same-day orders only — a cancel action.
// A today order has a chevron and expands to its per-person tickets, each
// individually cancellable; older orders are flat, download-only (outside the
// same-day storno window). Cancel = red trash icon → inline "Otkazati narudžbu? /
// ulaznicu?" confirm; on confirm the order (or its last active ticket) drops from
// the list (server query also excludes orders with zero active tickets). The
// user-facing verb is "otkazati"; the mechanism is still storno (same-day void).
type Page = { sales: RecentSalePageRow[]; hasMore: boolean }

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`

function localeOf(lang: AdminLang): string {
  return lang === 'hr' ? 'hr-HR' : 'en-GB'
}

/** order.created_at ISO → "8. lip 14:20" / "8 Jun, 14:20" (Europe/Zagreb). */
function formatSold(iso: string, lang: AdminLang): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(localeOf(lang), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zagreb',
  })
}

/** show ISO date 'YYYY-MM-DD' → "8. lip" / "8 Jun" (rendered at noon UTC). */
function formatShowDate(isoDate: string, lang: AdminLang): string {
  if (!isoDate) return ''
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(localeOf(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

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

  // Resync from the server whenever the dashboard re-renders (a new sale, or a
  // cancel here, triggers router.refresh()). "Adjust state during render" pattern
  // (React docs) rather than an effect, which the React Compiler lint disallows.
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

  const downloadTickets = (orderId: string) =>
    window.open(`/api/orders/${orderId}/tickets.pdf`, '_blank', 'noopener')

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
      // Mark the cancelled ticket(s), then drop the order once it has no active
      // tickets left (whole-order cancel, or the last per-ticket cancel). The
      // server query also excludes zero-active orders, so the refresh keeps it gone.
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
          {adminT(lang, 'noOrdersYet')}
        </p>
      </div>
    )
  }

  // The "Earlier" divider sits before the first non-today (read-only) order.
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
              <SaleRow
                sale={sale}
                lang={lang}
                open={expanded.has(sale.orderId)}
                onToggle={() => toggle(sale.orderId)}
                onDownload={downloadTickets}
                busy={busy}
                confirming={confirming}
                setConfirming={setConfirming}
                onCancel={cancel}
              />
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

function SaleRow({
  sale,
  lang,
  open,
  onToggle,
  onDownload,
  busy,
  confirming,
  setConfirming,
  onCancel,
}: {
  sale: RecentSalePageRow
  lang: AdminLang
  open: boolean
  onToggle: () => void
  onDownload: (orderId: string) => void
  busy: string | null
  confirming: string | null
  setConfirming: (key: string | null) => void
  onCancel: (orderId: string, ticketId?: string) => void
}) {
  const count = sale.adultCount + sale.childCount
  const activeCount = sale.tickets.filter((t) => t.status === 'active').length

  const info = (
    <>
      {sale.isToday && <Chevron open={open} />}
      <strong style={{ fontSize: 14 }}>{sale.code}</strong>
      <MetaItem title={adminT(lang, 'soldLabel')} icon={<ClockIcon />} text={formatSold(sale.createdAt, lang)} />
      <MetaItem title={adminT(lang, 'showWord')} icon={<ShowIcon />} text={formatShowDate(sale.showDate, lang)} />
      <MetaItem title={adminT(lang, 'peopleLabel')} icon={<PersonIcon />} text={String(count)} />
      <strong style={{ fontSize: 13 }}>{eur(sale.totalCents)}</strong>
    </>
  )

  return (
    <div style={saleRowBox}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        {sale.isToday ? (
          <button type="button" onClick={onToggle} aria-expanded={open} style={infoToggle}>
            {info}
          </button>
        ) : (
          <span style={infoStatic}>{info}</span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={() => onDownload(sale.orderId)}
            title={adminT(lang, 'downloadTickets')}
            aria-label={adminT(lang, 'downloadTickets')}
            style={iconBtn}
          >
            <DownloadIcon />
          </button>
          {sale.isToday && (
            <CancelControl
              cKey={sale.orderId}
              confirmText={adminT(lang, 'confirmCancelOrder')}
              ariaLabel={adminT(lang, 'cancelSale')}
              disabled={activeCount === 0}
              busy={busy === sale.orderId}
              lang={lang}
              confirming={confirming}
              setConfirming={setConfirming}
              onConfirm={() => onCancel(sale.orderId)}
            />
          )}
        </div>
      </div>

      {sale.isToday && open && (
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
                    confirmText={adminT(lang, 'confirmCancelTicket')}
                    ariaLabel={adminT(lang, 'cancelTicketAction')}
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

function MetaItem({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) {
  return (
    <span
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--theme-elevation-500)', fontSize: 12 }}
    >
      {icon}
      {text}
    </span>
  )
}

// Inline-confirm cancel: a red trash icon; tapping it swaps in the confirm
// question + Yes/No. Shared by the whole-order action and the per-ticket action.
function CancelControl({
  cKey,
  confirmText,
  ariaLabel,
  disabled = false,
  busy,
  lang,
  confirming,
  setConfirming,
  onConfirm,
}: {
  cKey: string
  confirmText: string
  ariaLabel: string
  disabled?: boolean
  busy: boolean
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
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--theme-elevation-700)' }}>{confirmText}</span>
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
      aria-label={ariaLabel}
      title={ariaLabel}
      style={disabled ? trashDisabled : trashBtn}
    >
      <TrashIcon />
    </button>
  )
}

// --- icons (inline SVG, currentColor — render consistently in the admin) ---
const metaIcon: React.CSSProperties = { width: 13, height: 13, flex: '0 0 auto' }
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" style={metaIcon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function ShowIcon() {
  return (
    <svg viewBox="0 0 24 24" style={metaIcon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" style={metaIcon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
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
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: '0 0 auto', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
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
const infoToggle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  flex: '1 1 auto',
  minWidth: 0,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'var(--theme-text)',
  textAlign: 'left',
}
const infoStatic: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  flex: '1 1 auto',
  minWidth: 0,
  color: 'var(--theme-text)',
}
const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  background: 'none',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-elevation-600)',
  cursor: 'pointer',
}
const trashBtn: React.CSSProperties = {
  ...iconBtn,
  border: '1px solid var(--theme-error-200, #e6b8b2)',
  color: 'var(--theme-error-500, #c0392b)',
}
const trashDisabled: React.CSSProperties = {
  ...iconBtn,
  color: 'var(--theme-elevation-300)',
  cursor: 'not-allowed',
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
