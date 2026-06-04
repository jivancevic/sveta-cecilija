'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { adminT, type AdminLang } from '@/lib/admin-i18n'
import { Stepper } from './dashboard/Stepper'

export interface SellShow {
  id: string
  label: string
  remaining: number
}

const ADULT_EUR = 20
const CHILD_EUR = 10

// Partner sell form (#144, revamped). Pick an active upcoming show, set
// adult/child counts via the Stepper (no native number spinner), submit to
// /api/partner/sell, open the combined ticket PDF to print, then show a
// self-dismissing success banner WITHOUT replacing the form — the partner can
// start the next sale immediately, and router.refresh() re-renders the
// dashboard's recent-sales / month-to-date / season figures in place (the old
// form left them stale until a full page reload). Server is the source of truth
// for capacity; this gives quick client feedback and blocks an obvious oversell.
export function PartnerSellForm({ shows, lang }: { shows: SellShow[]; lang: AdminLang }) {
  const router = useRouter()
  const [showId, setShowId] = React.useState(shows[0]?.id ?? '')
  const [adults, setAdults] = React.useState(0)
  const [children, setChildren] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [banner, setBanner] = React.useState<{ orderId: string; code: string; ticketCount: number } | null>(null)

  const selected = shows.find((s) => s.id === showId)
  const total = adults + children
  const totalEur = adults * ADULT_EUR + children * CHILD_EUR
  const overRemaining = !!selected && total > selected.remaining
  const canSubmit = !!showId && total > 0 && !overRemaining && !submitting

  // Auto-dismiss the success banner after 10s (the countdown bar mirrors this).
  React.useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 10000)
    return () => clearTimeout(t)
  }, [banner])

  const openPdf = (orderId: string) =>
    window.open(`/api/orders/${orderId}/tickets.pdf`, '_blank', 'noopener')

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/partner/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, adults, children }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(res.status === 409 ? adminT(lang, 'notEnoughSeats') : adminT(lang, 'saleFailed'))
        return
      }
      openPdf(data.orderId)
      setBanner({ orderId: data.orderId, code: data.code, ticketCount: data.ticketCount })
      setAdults(0)
      setChildren(0)
      // Re-render the server dashboard so the new sale shows up in recent sales,
      // month-to-date, and the season figures without a full reload.
      router.refresh()
    } catch {
      setError(adminT(lang, 'saleErrorNetwork'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, marginBottom: 14 }}>{adminT(lang, 'sellTickets')}</h2>

      {banner && (
        <SuccessBanner
          lang={lang}
          code={banner.code}
          ticketCount={banner.ticketCount}
          onOpenPdf={() => openPdf(banner.orderId)}
          onClose={() => setBanner(null)}
        />
      )}

      {shows.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
          {adminT(lang, 'noShowsToSell')}
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="psf-show" style={label}>
              {adminT(lang, 'showWord')}
            </label>
            <select id="psf-show" value={showId} onChange={(e) => setShowId(e.target.value)} style={field}>
              {shows.map((s) => (
                <option key={s.id} value={s.id} disabled={s.remaining <= 0}>
                  {s.label} —{' '}
                  {s.remaining > 0 ? `${s.remaining} ${adminT(lang, 'seatsLeft')}` : adminT(lang, 'soldOut')}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="psf-adults" style={label}>
                {adminT(lang, 'adults')} (€{ADULT_EUR})
              </label>
              <Stepper
                id="psf-adults"
                value={adults}
                onChange={setAdults}
                disabled={submitting}
                ariaLabel={adminT(lang, 'adults')}
              />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label htmlFor="psf-children" style={label}>
                {adminT(lang, 'children')} (€{CHILD_EUR})
              </label>
              <Stepper
                id="psf-children"
                value={children}
                onChange={setChildren}
                disabled={submitting}
                ariaLabel={adminT(lang, 'children')}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, color: 'var(--theme-elevation-600)' }}>
              {total > 0 ? (
                <>
                  <strong>{total}</strong> · <strong>€{totalEur}</strong>
                </>
              ) : (
                adminT(lang, 'enterCounts')
              )}
            </div>
            <button type="button" onClick={submit} disabled={!canSubmit} style={canSubmit ? primaryBtn : disabledBtn}>
              {submitting ? adminT(lang, 'issuing') : adminT(lang, 'issueTickets')}
            </button>
          </div>

          {overRemaining && (
            <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '10px 0 0' }}>
              {adminT(lang, 'notEnoughSeats')}
            </p>
          )}
          {error && (
            <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>
          )}
        </>
      )}
    </div>
  )
}

// Non-blocking success confirmation: a green banner with a 5-second countdown
// bar that drains left-to-right, then the parent unmounts it. The form stays put.
function SuccessBanner({
  lang,
  code,
  ticketCount,
  onOpenPdf,
  onClose,
}: {
  lang: AdminLang
  code: string
  ticketCount: number
  onOpenPdf: () => void
  onClose: () => void
}) {
  const [width, setWidth] = React.useState(100)
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(0))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      role="status"
      style={{
        background: '#1f7a3a',
        border: '1px solid #19632f',
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 16,
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 14, color: '#fff' }}>
          <strong>{adminT(lang, 'saleDoneTitle')}</strong>
          <div style={{ color: 'rgba(255,255,255,0.88)', marginTop: 2 }}>
            {ticketCount} · <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{code}</span> ·{' '}
            {adminT(lang, 'saleDonePdf')}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="×" style={closeBtn}>
          ×
        </button>
      </div>
      <button type="button" onClick={onOpenPdf} style={linkBtn}>
        {adminT(lang, 'openPdfAgain')}
      </button>
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.3)', overflow: 'hidden', marginTop: 8 }}>
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            background: '#fff',
            transition: 'width 10000ms linear',
          }}
        />
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 20,
}
const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: 'var(--theme-elevation-600)',
  marginBottom: 4,
}
const field: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontSize: 14,
}
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--theme-success-500, #1f7a3a)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
}
const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'var(--theme-elevation-150)',
  color: 'var(--theme-elevation-400)',
  cursor: 'not-allowed',
}
const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
}
const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: '6px 0 0',
}
