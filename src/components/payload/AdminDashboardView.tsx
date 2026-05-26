import React from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getStatsInput } from '@/lib/stats-data'
import { computeStats } from '@/lib/stats'
import { isAdminTier, isAuthed } from '@/lib/access/roles'
import { HeaderBlock, ShowsTable } from './stats-blocks'
import { QRScannerButton } from './QRScannerButton'

export const dynamic = 'force-dynamic'

// Replaces Payload's default collection-card dashboard. Rendered for /admin.
// Branches on role:
//   - tehnika: season aggregate + Scan-a-ticket button + show table (no PII).
//   - admin/superadmin: season aggregate + action row + show table.
export async function AdminDashboardView() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!isAuthed(user as { role?: string } | null)) {
    redirect(`/admin/login?redirect=${encodeURIComponent('/admin')}`)
  }

  const role = (user as { role?: string }).role
  const adminTier = isAdminTier(user as { role?: string })

  const input = await getStatsInput()
  const { header, rows } = computeStats(input)

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 16, fontSize: 24 }}>
        {adminTier ? 'Dashboard' : 'Door scan'}
      </h1>

      <HeaderBlock header={header} />

      {adminTier ? <AdminActions /> : <TehnikaActions />}

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

function TehnikaActions() {
  return (
    <div style={{ maxWidth: 480, margin: '0 0 24px' }}>
      <QRScannerButton />
    </div>
  )
}
