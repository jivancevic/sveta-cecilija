import React from 'react'
import type { DevDiagnostics } from '@/lib/dev-diagnostics/gather'
import type { EnvInfo } from '@/lib/dev-diagnostics/env-info'
import type { DataIntegrity } from '@/lib/dev-diagnostics/data-integrity'
import type { IntegrationHealth } from '@/lib/dev-diagnostics/integration-health'
import type { StripeBalanceSummary } from '@/lib/dev-diagnostics/stripe-balance'
import type { CriticalEventRow } from '@/lib/critical-events/list'

// Superadmin-only dev strip on /admin (#244, ADR-0016). The env/DB banner is
// always visible (it's PROTECTIVE — confirm you're not on prod before mutating);
// the rest of the diagnostics live in a collapsed panel. Rendered ONLY for a
// superadmin by AdminDashboardView; admin / tehnika / partner never see it.
//
// Deliberately ENGLISH regardless of the admin language toggle — it's a
// developer/operator tool, so it does NOT use adminT().
const COLLECTIONS = [
  'shows',
  'orders',
  'tickets',
  'partners',
  'contact-submissions',
  'posts',
  'order-lookups',
  'users',
] as const

export function SuperadminDevStrip({ data }: { data: DevDiagnostics }) {
  return (
    <section style={{ marginTop: 32 }}>
      <EnvBanner env={data.env} />

      <details
        style={{
          marginTop: 8,
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 8,
          padding: '12px 16px',
        }}
      >
        <summary style={summaryStyle}>Dev diagnostics</summary>

        <DataIntegritySection integrity={data.integrity} />
        <IntegrationHealthSection health={data.health} balance={data.balance} />
        <QuickLinks />
        <CriticalEventsSection events={data.criticalEvents} />
      </details>
    </section>
  )
}

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--theme-elevation-600)',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--theme-elevation-500)',
  margin: '18px 0 8px',
}

const listReset: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

// Env → banner palette. Prod is the dangerous one (red); staging amber; the rest
// neutral. A lookup keeps it trivial to add a tier later.
const ENV_PALETTE: Record<string, { bg: string; border: string; fg: string }> = {
  production: { bg: 'var(--theme-error-100, #fde8e8)', border: 'var(--theme-error-500, #c0392b)', fg: 'var(--theme-error-800, #7a1f17)' },
  staging: { bg: 'var(--theme-warning-100, #fef3cd)', border: 'var(--theme-warning-500, #c08a1e)', fg: 'var(--theme-warning-800, #6b4e09)' },
  default: { bg: 'var(--theme-elevation-50)', border: 'var(--theme-elevation-150)', fg: 'var(--theme-elevation-700)' },
}

// ── Environment + DB banner ───────────────────────────────────────────
function EnvBanner({ env }: { env: EnvInfo }) {
  const palette = ENV_PALETTE[env.environment] ?? ENV_PALETTE.default

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 14px',
        alignItems: 'baseline',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 12,
        color: palette.fg,
      }}
    >
      <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {env.environment}
        {env.danger ? ' · ⚠ live data' : ''}
      </strong>
      <span>
        db <code style={{ fontWeight: 700 }}>{env.databaseName ?? 'unknown'}</code>
      </span>
      {env.baseUrl ? <span style={{ color: 'inherit', opacity: 0.8 }}>{env.baseUrl}</span> : null}
    </div>
  )
}

// ── Data integrity ────────────────────────────────────────────────────
function DataIntegritySection({ integrity }: { integrity: DataIntegrity }) {
  const anomalies: { label: string; value: number }[] = [
    { label: 'orders without tickets', value: integrity.anomalies.ordersWithoutTickets },
    { label: 'tickets without order', value: integrity.anomalies.ticketsWithoutOrder },
    { label: 'past shows still active', value: integrity.anomalies.pastActiveShows },
    { label: 'incomplete refunds (refunded, tickets still active)', value: integrity.anomalies.incompleteRefunds },
  ]
  const rowCounts = Object.entries(integrity.rowCounts)

  return (
    <div>
      <p style={sectionTitle}>Data integrity</p>
      <ul style={listReset}>
        {anomalies.map((a) => (
          <li
            key={a.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '4px 0',
              fontSize: 12,
              color: a.value > 0 ? 'var(--theme-error-600, #c0392b)' : 'var(--theme-elevation-600)',
              fontWeight: a.value > 0 ? 700 : 400,
            }}
          >
            <span>{a.label}</span>
            <span>{a.value}</span>
          </li>
        ))}
      </ul>

      {rowCounts.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8, fontSize: 11, color: 'var(--theme-elevation-500)' }}>
          {rowCounts.map(([table, count]) => (
            <span key={table}>
              {table} <code style={{ color: 'var(--theme-text)' }}>{count}</code>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Integration health ────────────────────────────────────────────────
function IntegrationHealthSection({
  health,
  balance,
}: {
  health: IntegrationHealth
  balance: StripeBalanceSummary | null
}) {
  return (
    <div>
      <p style={sectionTitle}>Integration health</p>
      <ul style={{ ...listReset, fontSize: 12, color: 'var(--theme-elevation-600)' }}>
        <HealthRow label="last online order (≈ Stripe webhook)" value={formatAgo(health.lastOnlineOrderAt)} />
        <HealthRow label="last review email sent (≈ cron)" value={formatAgo(health.lastReviewEmailAt)} />
        <HealthRow
          label="Stripe balance (EUR)"
          value={
            balance
              ? `available ${fmtEur(balance.availableEur)} · pending ${fmtEur(balance.pendingEur)}`
              : 'unavailable'
          }
        />
      </ul>
    </div>
  )
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span>{label}</span>
      <span style={{ color: 'var(--theme-text)', fontFamily: 'var(--font-mono, monospace)' }}>{value}</span>
    </li>
  )
}

// ── Quick links ───────────────────────────────────────────────────────
function QuickLinks() {
  return (
    <div>
      <p style={sectionTitle}>Quick links</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {COLLECTIONS.map((slug) => (
          <a
            key={slug}
            href={`/admin/collections/${slug}`}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid var(--theme-elevation-150)',
              background: 'var(--theme-elevation-0)',
              color: 'var(--theme-text)',
              textDecoration: 'none',
            }}
          >
            {slug}
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Critical events (the original #235 sink) ──────────────────────────
function CriticalEventsSection({ events }: { events: CriticalEventRow[] }) {
  return (
    <div>
      <p style={sectionTitle}>Critical events ({events.length})</p>
      {events.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--theme-elevation-500)', margin: 0 }}>
          No critical events recorded.
        </p>
      ) : (
        <ul style={listReset}>
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                padding: '6px 0',
                borderTop: '1px solid var(--theme-elevation-100)',
                fontSize: 12,
              }}
            >
              <time dateTime={e.createdAt} style={{ flex: '0 0 auto', color: 'var(--theme-elevation-500)', fontFamily: 'var(--font-mono, monospace)' }}>
                {formatTimestamp(e.createdAt)}
              </time>
              <code style={{ flex: '0 0 auto', fontWeight: 600, color: 'var(--theme-text)' }}>{e.kind}</code>
              <span style={{ flex: '1 1 auto', color: 'var(--theme-elevation-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shortContext(e.context)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── formatting helpers (locale-stable UTC; never throw) ───────────────
function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  })
}

// Compact "x ago" for freshness signals; falls back to "never" for null.
function formatAgo(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function fmtEur(v: number | null): string {
  return v == null ? '—' : `€${v.toFixed(2)}`
}

function shortContext(context: Record<string, unknown> | null): string {
  if (!context) return ''
  try {
    return Object.entries(context)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' · ')
  } catch {
    return ''
  }
}
