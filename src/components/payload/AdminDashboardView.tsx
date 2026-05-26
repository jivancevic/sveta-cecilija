import React from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getStatsInput } from '@/lib/stats-data'
import { computeStats } from '@/lib/stats'
import { isAdminTier, isAuthed } from '@/lib/access/roles'
import { getNextShow, getScannedPeopleForShow, type NextShow } from '@/lib/shows'
import { HeaderBlock, ShowsTable } from './stats-blocks'
import { QRScannerAutoStart } from './QRScannerAutoStart'
import { TicketLookupPanel } from './TicketLookupPanel'

export const dynamic = 'force-dynamic'

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

// Replaces Payload's default collection-card dashboard. Rendered for /admin.
// Branches on role:
//   - tehnika: next-show-only block + Scan-a-ticket button. No season aggregate,
//              no revenue, no other shows. See ADR-0006 / CONTEXT.md "Stats dashboard".
//   - admin/superadmin: season aggregate + action row + show table.
export async function AdminDashboardView() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!isAuthed(user as { role?: string } | null)) {
    redirect(`/admin/login?redirect=${encodeURIComponent('/admin')}`)
  }

  const role = (user as { role?: string }).role
  const adminTier = isAdminTier(user as { role?: string })

  if (!adminTier) {
    return <TehnikaDashboard role={role} />
  }

  const input = await getStatsInput()
  const { header, rows } = computeStats(input)

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 16, fontSize: 24 }}>Dashboard</h1>

      <HeaderBlock header={header} />

      <AdminActions />

      <h2 style={{ fontSize: 16, margin: '24px 0 8px' }}>Shows (last 7 days + upcoming)</h2>
      <ShowsTable rows={rows} />

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        Signed in as {role}.
      </p>
    </div>
  )
}

function AdminActions() {
  const button: React.CSSProperties = {
    display: 'block',
    padding: '14px 16px',
    background: 'var(--theme-elevation-50)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 6,
    textDecoration: 'none',
    color: 'var(--theme-text)',
    fontWeight: 600,
    textAlign: 'center',
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}
    >
      <Link href="/admin/collections/shows/create" style={button}>
        + Add show
      </Link>
      <Link href="/admin/collections/shows" style={button}>
        Record in-person sale
      </Link>
      <Link href="/admin/collections/orders" style={button}>
        Find order
      </Link>
      <Link href="/admin/collections/contact-submissions" style={button}>
        Inquiries
      </Link>
    </div>
  )
}

async function TehnikaDashboard({ role }: { role?: string }) {
  const next = await getNextShow()
  const scanned = next ? await getScannedPeopleForShow(next.id) : 0

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 16, fontSize: 24 }}>Door scan</h1>

      {next ? (
        <NextShowBlock next={next} scanned={scanned} />
      ) : (
        <p
          style={{
            background: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 8,
            padding: 20,
            color: 'var(--theme-elevation-600)',
            marginBottom: 24,
          }}
        >
          No upcoming shows scheduled.
        </p>
      )}

      <div style={{ maxWidth: 480 }}>
        <QRScannerAutoStart />
      </div>

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        Signed in as {role}.
      </p>
    </div>
  )
}

function formatShowDate(iso: string): string {
  // iso is YYYY-MM-DD; render as "Sun, 12 Jul 2026"
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function NextShowBlock({ next, scanned }: { next: NextShow; scanned: number }) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Next show
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {formatShowDate(next.date)}
      </div>
      <div style={{ color: 'var(--theme-elevation-600)', marginBottom: 16 }}>
        {next.time} · {VENUE_LABEL[next.venue] ?? next.venue}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label="Online sold" value={next.onlineSold} />
        <Stat label="Scanned" value={scanned} />
        <Stat label="In-person sold" value={next.inPersonSold} />
      </div>
      <div style={{ marginTop: 16 }}>
        <TicketLookupPanel showId={next.id} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}
