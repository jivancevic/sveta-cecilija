'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import type { RecentSalePageRow } from '@/lib/partner/recent-sales-page'

// "Nedavne narudžbe / Recent orders" for the partner dashboard. Shows the newest
// 3 by default; "Prikaži više" opens a 10-per-page pager (‹ › through the whole
// history), "Prikaži manje" collapses back to 3. Each order is a dense row: code,
// clock = sold date+time, crossed-swords = the izvedba date, people, money, a
// download-tickets icon, and (today only) a cancel icon. A today order expands to
// its per-person tickets, each individually cancellable. Cancel is **delete-then-
// undo** (no confirm, ADR-0017): the trash voids immediately and a muted banner
// offers Undo for a few seconds (order 6s, ticket 4s) backed by the restore
// endpoint; the user-facing verb is "otkazati", the mechanism is storno.
type Page = { sales: RecentSalePageRow[]; hasMore: boolean }
type View = { sales: RecentSalePageRow[]; hasMore: boolean; page: number; mode: 'collapsed' | 'pager' }

const COLLAPSED_SIZE = 3
const PAGER_SIZE = 10
const ORDER_UNDO_MS = 6000
const TICKET_UNDO_MS = 4000

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`
const localeOf = (lang: AdminLang) => (lang === 'hr' ? 'hr-HR' : 'en-GB')

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
function formatShowDate(isoDate: string, lang: AdminLang): string {
  if (!isoDate) return ''
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(localeOf(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

type UndoState = { kind: 'order' | 'ticket'; orderId: string; ticketId?: string; label: string; ms: number }

export function PartnerRecentSales({ initial, lang }: { initial: Page; lang: AdminLang }) {
  const router = useRouter()
  const [view, setView] = React.useState<View>({ ...initial, page: 1, mode: 'collapsed' })
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [undo, setUndo] = React.useState<UndoState | null>(null)

  // Resync the COLLAPSED view from the server after a router.refresh() (a new
  // sale, a cancel, an undo) — but never yank the user out of the pager. "Adjust
  // state during render" pattern (the React Compiler lint forbids setState in an
  // effect here).
  const [lastInitial, setLastInitial] = React.useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    if (view.mode === 'collapsed') setView({ ...initial, page: 1, mode: 'collapsed' })
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

  const load = async (mode: View['mode'], page: number) => {
    setLoading(true)
    setError(null)
    try {
      const size = mode === 'collapsed' ? COLLAPSED_SIZE : PAGER_SIZE
      const res = await fetch(`/api/partner/sales?page=${page}&size=${size}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(adminT(lang, 'cancelFailed'))
        return
      }
      setView({ sales: (data.sales as RecentSalePageRow[]) ?? [], hasMore: Boolean(data.hasMore), page, mode })
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setLoading(false)
    }
  }

  const cancel = async (orderId: string, ticketId?: string) => {
    const key = ticketId ? `${orderId}:${ticketId}` : orderId
    setBusy(key)
    setError(null)
    const row = view.sales.find((s) => s.orderId === orderId)
    const code = row?.code ?? ''
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
      // Optimistic: mark the cancelled ticket(s); drop the order once it has no
      // active tickets. Show the undo banner; the void is already committed.
      const ref = ticketId ? row?.tickets.find((t) => t.id === ticketId)?.ref ?? code : code
      setView((v) => {
        const mapped = v.sales.map((s) =>
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
        return { ...v, sales: noneActive ? mapped.filter((s) => s.orderId !== orderId) : mapped }
      })
      setUndo(
        ticketId
          ? { kind: 'ticket', orderId, ticketId, label: `${adminT(lang, 'ticketCancelled')} ${ref}`, ms: TICKET_UNDO_MS }
          : { kind: 'order', orderId, label: `${adminT(lang, 'orderCancelled')} ${code}`, ms: ORDER_UNDO_MS },
      )
      router.refresh() // refresh the other cards (month-to-date, statistics)
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setBusy(null)
    }
  }

  const doUndo = async () => {
    if (!undo) return
    const { orderId, ticketId } = undo
    setUndo(null)
    setError(null)
    try {
      const res = await fetch('/api/partner/storno/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketId ? { orderId, ticketId } : { orderId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(adminT(lang, data.code === 'SEAT_TAKEN' ? 'undoSeatTaken' : 'undoFailed'))
        return
      }
      await load(view.mode, view.page) // bring the restored order/ticket back
      router.refresh()
    } catch {
      setError(adminT(lang, 'undoFailed'))
    }
  }

  const sales = view.sales
  const firstOlderIdx = sales.findIndex((s) => !s.isToday)

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{adminT(lang, 'recentSales')}</h2>
      <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '0 0 14px' }}>
        {adminT(lang, 'recentCancelNote')}
      </p>

      {undo && <UndoBanner key={`${undo.orderId}:${undo.ticketId ?? ''}`} state={undo} lang={lang} onUndo={doUndo} onClose={() => setUndo(null)} />}

      {error && (
        <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      )}

      {sales.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>{adminT(lang, 'noOrdersYet')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sales.map((sale, idx) => (
            <React.Fragment key={sale.orderId}>
              {!sale.isToday && idx === firstOlderIdx ? (
                <div style={earlierLabel}>{adminT(lang, 'earlierSales')}</div>
              ) : null}
              <SaleRow
                sale={sale}
                lang={lang}
                open={expanded.has(sale.orderId)}
                onToggle={() => toggle(sale.orderId)}
                onDownload={downloadTickets}
                busy={busy}
                onCancel={cancel}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      <Controls view={view} lang={lang} loading={loading} onMore={() => load('pager', 1)} onLess={() => load('collapsed', 1)} onPage={(p) => load('pager', p)} />
    </div>
  )
}

function Controls({
  view,
  lang,
  loading,
  onMore,
  onLess,
  onPage,
}: {
  view: View
  lang: AdminLang
  loading: boolean
  onMore: () => void
  onLess: () => void
  onPage: (page: number) => void
}) {
  if (view.mode === 'collapsed') {
    if (!view.hasMore) return null
    return (
      <button type="button" onClick={onMore} disabled={loading} style={pillBtn}>
        {loading ? adminT(lang, 'loadingMore') : adminT(lang, 'showMore')}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => onPage(view.page - 1)} disabled={loading || view.page <= 1} aria-label={adminT(lang, 'pagePrev')} style={view.page <= 1 ? pagerDisabled : pagerBtn}>
        ‹
      </button>
      <span style={{ fontSize: 13, color: 'var(--theme-elevation-600)', minWidth: 20, textAlign: 'center' }}>{view.page}</span>
      <button type="button" onClick={() => onPage(view.page + 1)} disabled={loading || !view.hasMore} aria-label={adminT(lang, 'pageNext')} style={!view.hasMore ? pagerDisabled : pagerBtn}>
        ›
      </button>
      <button type="button" onClick={onLess} disabled={loading} style={{ ...pillBtn, marginTop: 0, marginLeft: 'auto' }}>
        {adminT(lang, 'showLess')}
      </button>
    </div>
  )
}

// Muted top-of-panel banner with a draining bar; dismisses when the bar finishes
// (the void stands) or when Undo is tapped.
function UndoBanner({ state, lang, onUndo, onClose }: { state: UndoState; lang: AdminLang; onUndo: () => void; onClose: () => void }) {
  const [width, setWidth] = React.useState(100)
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(0))
    const fallback = setTimeout(onClose, state.ms + 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [onClose, state.ms])

  return (
    <div role="status" style={undoBox}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--theme-text)' }}>{state.label}</span>
        <button type="button" onClick={onUndo} style={undoBtn}>
          {adminT(lang, 'undo')}
        </button>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'var(--theme-elevation-200)', overflow: 'hidden', marginTop: 8 }}>
        <div
          onTransitionEnd={(e) => {
            if (e.propertyName === 'width') onClose()
          }}
          style={{ width: `${width}%`, height: '100%', background: 'var(--theme-elevation-450, #8a8a8a)', transition: `width ${state.ms}ms linear` }}
        />
      </div>
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
  onCancel,
}: {
  sale: RecentSalePageRow
  lang: AdminLang
  open: boolean
  onToggle: () => void
  onDownload: (orderId: string) => void
  busy: string | null
  onCancel: (orderId: string, ticketId?: string) => void
}) {
  const count = sale.adultCount + sale.childCount
  const activeCount = sale.tickets.filter((t) => t.status === 'active').length

  const info = (
    <>
      {sale.isToday && <Chevron open={open} />}
      <strong style={{ fontSize: 14 }}>{sale.code}</strong>
      <MetaItem title={adminT(lang, 'soldLabel')} icon={<ClockIcon />} text={formatSold(sale.createdAt, lang)} />
      <MetaItem title={adminT(lang, 'showWord')} icon={<SwordsIcon />} text={formatShowDate(sale.showDate, lang)} />
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
          <button type="button" onClick={() => onDownload(sale.orderId)} title={adminT(lang, 'downloadTickets')} aria-label={adminT(lang, 'downloadTickets')} style={iconBtn}>
            <DownloadIcon />
          </button>
          {sale.isToday && (
            <CancelButton
              disabled={activeCount === 0}
              busy={busy === sale.orderId}
              label={adminT(lang, 'cancelSale')}
              lang={lang}
              onClick={() => onCancel(sale.orderId)}
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
                  <CancelButton
                    busy={busy === `${sale.orderId}:${t.id}`}
                    label={adminT(lang, 'cancelTicketAction')}
                    lang={lang}
                    onClick={() => onCancel(sale.orderId, t.id)}
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

// Trash-icon cancel: no confirm — tapping it voids immediately (the undo banner
// is the safety net, ADR-0017).
function CancelButton({ disabled = false, busy, label, lang, onClick }: { disabled?: boolean; busy: boolean; label: string; lang: AdminLang; onClick: () => void }) {
  if (busy) {
    return <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>{adminT(lang, 'cancelling')}</span>
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={label} title={label} style={disabled ? trashDisabled : trashBtn}>
      <TrashIcon />
    </button>
  )
}

function MetaItem({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--theme-elevation-500)', fontSize: 12 }}>
      {icon}
      {text}
    </span>
  )
}

// --- icons (inline SVG, currentColor) ---
const metaIcon: React.CSSProperties = { width: 13, height: 13, flex: '0 0 auto' }
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" style={metaIcon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
// Crossed swords (moreška = sword dance → the izvedba). Lucide "swords".
function SwordsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={metaIcon} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" y1="14" x2="9" y2="18" />
      <line x1="7" y1="17" x2="4" y2="20" />
      <line x1="3" y1="19" x2="5" y2="21" />
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
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} aria-hidden="true">
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
const infoStatic: React.CSSProperties = { ...infoToggle, cursor: 'default' }
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
const trashDisabled: React.CSSProperties = { ...iconBtn, color: 'var(--theme-elevation-300)', cursor: 'not-allowed' }
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
const pillBtn: React.CSSProperties = {
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
const pagerBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  cursor: 'pointer',
}
const pagerDisabled: React.CSSProperties = { ...pagerBtn, color: 'var(--theme-elevation-300)', cursor: 'not-allowed' }
const undoBox: React.CSSProperties = {
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 8,
  padding: '10px 12px',
  marginBottom: 14,
}
const undoBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--theme-success-600, #1f7a3a)',
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
}
