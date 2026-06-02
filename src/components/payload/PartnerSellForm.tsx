'use client'

import React from 'react'

export interface SellShow {
  id: string
  label: string
  remaining: number
}

const ADULT_EUR = 20
const CHILD_EUR = 10

// Partner sell form (#144). Pick an active upcoming show, enter adult/child
// counts, submit to /api/partner/sell, then open the combined ticket PDF to
// print. The server is the source of truth for capacity; this just gives quick
// client-side feedback and disables submit on an obvious oversell.
export function PartnerSellForm({ shows }: { shows: SellShow[] }) {
  const [showId, setShowId] = React.useState(shows[0]?.id ?? '')
  const [adults, setAdults] = React.useState(0)
  const [children, setChildren] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{ orderId: string; code: string; ticketCount: number } | null>(null)

  const selected = shows.find((s) => s.id === showId)
  const total = adults + children
  const totalEur = adults * ADULT_EUR + children * CHILD_EUR
  const overRemaining = !!selected && total > selected.remaining
  const canSubmit = !!showId && total > 0 && !overRemaining && !submitting

  const openPdf = (orderId: string) => window.open(`/api/orders/${orderId}/tickets.pdf`, '_blank', 'noopener')

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
        setError(data.error || 'Could not complete the sale')
        return
      }
      setResult({ orderId: data.orderId, code: data.code, ticketCount: data.ticketCount })
      openPdf(data.orderId)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setAdults(0)
    setChildren(0)
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

  if (result) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Sale complete</h2>
        <p style={{ color: 'var(--theme-elevation-600)', fontSize: 14, margin: '0 0 14px' }}>
          Issued <strong>{result.ticketCount}</strong> ticket{result.ticketCount === 1 ? '' : 's'} — reference{' '}
          <strong>{result.code}</strong>. The printable PDF opened in a new tab.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => openPdf(result.orderId)} style={primaryBtn}>
            Open PDF again
          </button>
          <button type="button" onClick={reset} style={secondaryBtn}>
            New sale
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, marginBottom: 14 }}>Sell tickets</h2>

      {shows.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
          No upcoming shows are available to sell right now.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="psf-show" style={label}>
              Show
            </label>
            <select id="psf-show" value={showId} onChange={(e) => setShowId(e.target.value)} style={field}>
              {shows.map((s) => (
                <option key={s.id} value={s.id} disabled={s.remaining <= 0}>
                  {s.label} — {s.remaining > 0 ? `${s.remaining} seats left` : 'sold out'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label htmlFor="psf-adults" style={label}>
                Adults (€{ADULT_EUR})
              </label>
              <input
                id="psf-adults"
                type="number"
                min={0}
                value={adults}
                onChange={(e) => setAdults(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                style={field}
              />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label htmlFor="psf-children" style={label}>
                Children (€{CHILD_EUR})
              </label>
              <input
                id="psf-children"
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                style={field}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, color: 'var(--theme-elevation-600)' }}>
              {total > 0 ? (
                <>
                  <strong>{total}</strong> ticket{total === 1 ? '' : 's'} · <strong>€{totalEur}</strong>
                </>
              ) : (
                'Enter adult and child counts'
              )}
            </div>
            <button type="button" onClick={submit} disabled={!canSubmit} style={canSubmit ? primaryBtn : disabledBtn}>
              {submitting ? 'Issuing…' : 'Issue tickets'}
            </button>
          </div>

          {overRemaining && (
            <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '10px 0 0' }}>
              Only {selected?.remaining} seat{selected?.remaining === 1 ? '' : 's'} left for this show.
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
const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--theme-elevation-100)',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 6,
  color: 'var(--theme-text)',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
}
