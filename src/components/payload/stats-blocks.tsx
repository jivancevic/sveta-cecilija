import React from 'react'
import Link from 'next/link'
import type { StatsRow, StatsHeader } from '@/lib/stats'

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

export function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function HeaderBlock({ header }: { header: StatsHeader }) {
  const cardStyle: React.CSSProperties = {
    background: 'var(--theme-elevation-50)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 6,
    padding: '14px 16px',
    minWidth: 0,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--theme-elevation-500)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  }
  const numStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700 }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}
    >
      <div style={cardStyle}>
        <div style={labelStyle}>Total Sold</div>
        <div style={numStyle}>{header.totalSold}</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Scanned</div>
        <div style={numStyle}>{header.totalScanned}</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Revenue</div>
        <div style={numStyle}>{eur(header.totalRevenueCents)}</div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Ljetno kino</div>
        <div style={numStyle}>{header.byVenue['ljetno-kino'].sold}</div>
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          {header.byVenue['ljetno-kino'].scanned} scanned
        </div>
      </div>
      <div style={cardStyle}>
        <div style={labelStyle}>Centar za kulturu</div>
        <div style={numStyle}>{header.byVenue['zimsko-kino'].sold}</div>
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          {header.byVenue['zimsko-kino'].scanned} scanned
        </div>
      </div>
    </div>
  )
}

export function ShowsTable({ rows }: { rows: StatsRow[] }) {
  const headStyle: React.CSSProperties = {
    padding: '10px 8px',
    textAlign: 'left',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--theme-elevation-500)',
    fontWeight: 600,
  }

  if (rows.length === 0) {
    return <p style={{ color: 'var(--theme-elevation-500)' }}>No shows in the active window.</p>
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--theme-elevation-100)', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ background: 'var(--theme-elevation-50)' }}>
            <th style={headStyle}>Date</th>
            <th style={headStyle}>Time</th>
            <th style={headStyle}>Venue</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Cap.</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Online</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>In-person</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Scanned</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ShowRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ShowRow({ row }: { row: StatsRow }) {
  const cell: React.CSSProperties = { padding: '10px 8px', fontSize: 13, whiteSpace: 'nowrap' }
  const muted = row.status === 'cancelled'
  return (
    <tr style={{ borderTop: '1px solid var(--theme-elevation-100)', opacity: muted ? 0.55 : 1 }}>
      <td style={cell}>
        <Link
          href={`/admin/stats/${row.id}`}
          style={{ color: 'var(--theme-text)', textDecoration: 'none', fontWeight: 600 }}
        >
          {row.date}
        </Link>
      </td>
      <td style={cell}>{row.time}</td>
      <td style={cell}>{VENUE_LABEL[row.venue]}</td>
      <td style={{ ...cell, textAlign: 'right' }}>{row.capacity}</td>
      <td style={{ ...cell, textAlign: 'right' }}>{row.onlineSold}</td>
      <td style={{ ...cell, textAlign: 'right' }}>{row.inPersonSold}</td>
      <td style={{ ...cell, textAlign: 'right' }}>{row.scanned}</td>
      <td style={{ ...cell, textAlign: 'right' }}>{row.remaining}</td>
    </tr>
  )
}
