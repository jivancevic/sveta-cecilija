import React from 'react'
import Link from 'next/link'
import type { ShowStatsHeader, ShowStatsOrderRow } from '@/lib/show-stats'

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '16px 18px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

function HeaderBlock({ header, showAdminBits }: { header: ShowStatsHeader; showAdminBits: boolean }) {
  return (
    <>
      <div style={{ marginBottom: 12, color: 'var(--theme-elevation-600)' }}>
        <strong>{header.date}</strong> · {header.time} · {VENUE_LABEL[header.venue] ?? header.venue}
        {header.status === 'cancelled' ? (
          <span
            style={{
              marginLeft: 10,
              padding: '2px 8px',
              borderRadius: 4,
              background: 'var(--theme-error-100)',
              color: 'var(--theme-error-800)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Cancelled
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 28,
        }}
      >
        <Stat label="Online sold" value={header.onlineSold} />
        <Stat label="In-person sold" value={header.inPersonSold} />
        <Stat label="Legacy reserved" value={header.legacyReserved} />
        <Stat label="Scanned" value={header.scanned} />
        <Stat label="Remaining" value={header.remaining} />
        {showAdminBits ? <Stat label="Revenue" value={eur(header.revenueCents)} /> : null}
      </div>
    </>
  )
}

function OrderList({ orders }: { orders: ShowStatsOrderRow[] }) {
  const cell: React.CSSProperties = { padding: '10px 8px', fontSize: 13, verticalAlign: 'top' }
  const head: React.CSSProperties = {
    ...cell,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--theme-elevation-500)',
    fontWeight: 600,
    textAlign: 'left',
  }
  if (orders.length === 0) {
    return (
      <p style={{ color: 'var(--theme-elevation-500)' }}>No online orders for this show yet.</p>
    )
  }
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--theme-elevation-100)',
        borderRadius: 6,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ background: 'var(--theme-elevation-50)' }}>
            <th style={head}>Buyer</th>
            <th style={head}>Email</th>
            <th style={{ ...head, textAlign: 'right' }}>Tickets</th>
            <th style={head}>QR tokens</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              style={{
                borderTop: '1px solid var(--theme-elevation-100)',
                opacity: o.refunded ? 0.55 : 1,
              }}
            >
              <td style={cell}>
                <Link
                  href={`/admin/collections/orders/${o.id}`}
                  style={{ color: 'var(--theme-text)', textDecoration: 'none', fontWeight: 600 }}
                >
                  {o.buyerName}
                </Link>
                {o.refunded ? (
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
                    (refunded)
                  </span>
                ) : null}
              </td>
              <td style={cell}>{o.email}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{o.ticketCount}</td>
              <td style={cell}>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {o.tokens.map((t) => (
                    <li key={t.token} style={{ fontSize: 12, lineHeight: 1.5 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: 11,
                          marginRight: 6,
                          background: t.scanned ? 'var(--theme-success-100)' : 'var(--theme-elevation-100)',
                          color: t.scanned ? 'var(--theme-success-800)' : 'var(--theme-elevation-600)',
                        }}
                      >
                        {t.scanned ? 'Scanned' : 'Unscanned'}
                      </span>
                      {t.scanned && t.scannedAt ? (
                        <span style={{ color: 'var(--theme-elevation-500)' }}>
                          {new Date(t.scannedAt).toLocaleString()}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminShowStatsBody({
  header,
  orders,
  adminView,
}: {
  header: ShowStatsHeader
  orders: ShowStatsOrderRow[]
  adminView: boolean
}) {
  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1280 }}>
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/admin/stats"
          style={{ fontSize: 12, color: 'var(--theme-elevation-500)', textDecoration: 'none' }}
        >
          ← All shows
        </Link>
      </div>
      <h1 style={{ marginBottom: 12, fontSize: 24 }}>Show stats</h1>

      <HeaderBlock header={header} showAdminBits={adminView} />

      {adminView ? (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Orders ({orders.length})</h2>
          <OrderList orders={orders} />
        </>
      ) : null}
    </div>
  )
}
