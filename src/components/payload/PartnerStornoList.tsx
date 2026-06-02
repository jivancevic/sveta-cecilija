'use client'

import React from 'react'

// One person's ticket within a today's sale.
export interface StornoTicket {
  id: string
  /** Human ref printed on the slip, e.g. ABCD-1. */
  ref: string
  type: 'adult' | 'child' | string
  status: 'active' | 'cancelled' | string
}

// A sale (order) the partner made today (Europe/Zagreb), still within the
// same-day storno window.
export interface StornoSale {
  orderId: string
  code: string
  /** HH:MM Europe/Zagreb, for the partner to recognise the sale. */
  soldAt: string
  showLabel: string
  tickets: StornoTicket[]
}

// Same-day storno list for the partner dashboard (#145). Lists today's sales
// (server-scoped to this partner) and offers "Cancel whole sale" plus per-ticket
// "Cancel" actions, each POSTing to /api/partner/storno. The server re-checks
// ownership and the same-day window; this is just the operator surface. On
// success we refresh from the server so seat counts and statuses stay truthful.
export function PartnerStornoList({ sales: initialSales }: { sales: StornoSale[] }) {
  const [sales, setSales] = React.useState(initialSales)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const post = async (orderId: string, ticketId?: string, busyKey?: string) => {
    setBusy(busyKey ?? orderId)
    setError(null)
    try {
      const res = await fetch('/api/partner/storno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketId ? { orderId, ticketId } : { orderId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not cancel — please try again')
        return
      }
      // Reflect the change locally; a full refresh syncs remaining seats too.
      setSales((prev) =>
        prev.map((s) => {
          if (s.orderId !== orderId) return s
          return {
            ...s,
            tickets: s.tickets.map((t) =>
              ticketId ? (t.id === ticketId ? { ...t, status: 'cancelled' } : t) : { ...t, status: 'cancelled' },
            ),
          }
        }),
      )
      // Pull fresh server state (seats derive from active tickets).
      if (typeof window !== 'undefined') window.location.reload()
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(null)
    }
  }

  if (sales.length === 0) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Today’s sales</h2>
        <p style={{ color: 'var(--theme-elevation-500)', fontSize: 14, margin: 0 }}>
          No sales today yet. Sales can be cancelled here on the same day they’re made.
        </p>
      </div>
    )
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>Today’s sales</h2>
      <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '0 0 14px' }}>
        You can cancel a ticket or a whole sale on the same day it was made.
      </p>

      {error && (
        <p style={{ color: 'var(--theme-error-500, #c0392b)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sales.map((sale) => {
          const activeCount = sale.tickets.filter((t) => t.status === 'active').length
          const saleBusy = busy === sale.orderId
          return (
            <div key={sale.orderId} style={saleRow}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sale.code}</div>
                  <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
                    {sale.soldAt} · {sale.showLabel}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={activeCount === 0 || saleBusy}
                  onClick={() => post(sale.orderId)}
                  style={activeCount === 0 ? dangerBtnDisabled : dangerBtn}
                >
                  {saleBusy ? 'Cancelling…' : 'Cancel whole sale'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sale.tickets.map((t) => {
                  const tBusy = busy === `${sale.orderId}:${t.id}`
                  const cancelled = t.status !== 'active'
                  return (
                    <div key={t.id} style={ticketRow}>
                      <span style={{ fontSize: 13, color: cancelled ? 'var(--theme-elevation-400)' : 'var(--theme-text)' }}>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.ref}</span>{' '}
                        <span style={{ color: 'var(--theme-elevation-500)' }}>· {t.type}</span>
                        {cancelled && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--theme-error-500, #c0392b)' }}>
                            cancelled
                          </span>
                        )}
                      </span>
                      {!cancelled && (
                        <button
                          type="button"
                          disabled={tBusy || saleBusy}
                          onClick={() => post(sale.orderId, t.id, `${sale.orderId}:${t.id}`)}
                          style={dangerLink}
                        >
                          {tBusy ? 'Cancelling…' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
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
const saleRow: React.CSSProperties = {
  background: 'var(--theme-elevation-0)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: 14,
}
const ticketRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '4px 0',
}
const dangerBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--theme-error-500, #c0392b)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  alignSelf: 'flex-start',
}
const dangerBtnDisabled: React.CSSProperties = {
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
