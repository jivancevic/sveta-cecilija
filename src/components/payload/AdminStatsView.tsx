import React from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getStatsInput } from '@/lib/stats-data'
import { computeStats, type StatsRow, type StatsHeader } from '@/lib/stats'
import { getShowStatsInput } from '@/lib/show-stats-data'
import { computeShowStats } from '@/lib/show-stats'
import { isAdminTier } from '@/lib/access/roles'
import { AdminShowStatsBody } from './AdminShowStatsView'

export const dynamic = 'force-dynamic'

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function HeaderBlock({ header }: { header: StatsHeader }) {
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

type AdminStatsViewProps = {
  initPageResult?: { req?: { pathname?: string } }
}

// Treats /admin/stats as the list view and /admin/stats/<showId> as the
// drill-down. Done as one component because Payload v3 only resolves custom
// view paths with a single segment — `/stats/:showId` registered separately
// is never reached. See payload.config.ts.
function parseShowId(pathname: string | undefined): string | null {
  if (!pathname) return null
  const match = pathname.match(/\/stats\/([^/?#]+)\/?$/)
  return match ? match[1] : null
}

export async function AdminStatsView(props: AdminStatsViewProps = {}) {
  const pathname = props.initPageResult?.req?.pathname
  const showId = parseShowId(pathname)

  // The Payload admin shell renders this view's layout even when no user is
  // present, so we must gate the data ourselves — otherwise season revenue
  // and order PII leak to anonymous visitors.
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) {
    const target = showId ? `/admin/stats/${showId}` : '/admin/stats'
    redirect(`/admin/login?redirect=${encodeURIComponent(target)}`)
  }

  if (showId) {
    const input = await getShowStatsInput(showId)
    if (!input) notFound()
    const { header, orders } = computeShowStats(input)
    const adminView = isAdminTier(user as { role?: string })
    return <AdminShowStatsBody header={header} orders={orders} adminView={adminView} />
  }

  const input = await getStatsInput()
  const { header, rows } = computeStats(input)

  const headStyle: React.CSSProperties = {
    padding: '10px 8px',
    textAlign: 'left',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--theme-elevation-500)',
    fontWeight: 600,
  }

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1280 }}>
      <h1 style={{ marginBottom: 16, fontSize: 24 }}>Stats</h1>
      <HeaderBlock header={header} />

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Shows (last 7 days + upcoming)</h2>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)' }}>No shows in the active window.</p>
      ) : (
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
      )}
    </div>
  )
}
