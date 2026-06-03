import React from 'react'
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getStatsInput } from '@/lib/stats-data'
import { computeStats } from '@/lib/stats'
import { ADMIN_LANG_COOKIE, adminT, resolveAdminLang, type AdminLang } from '@/lib/admin-i18n'
import { isAdminTier, isAuthed, isPartner, partnerIdOf } from '@/lib/access/roles'
import { getNextShow, getScannedPeopleForShow, getUpcomingShows, type NextShow } from '@/lib/shows'
import { doorProgress } from '@/lib/dashboard/door-progress'
import { HeaderBlock, ShowsTable } from './stats-blocks'
import { TicketLookupPanel } from './TicketLookupPanel'
import { PartnerSellForm, type SellShow } from './PartnerSellForm'
import { PartnerStornoList } from './PartnerStornoList'
import { getPartnerTodaySales } from '@/lib/partner/today-sales'
import { PartnerSalesPanel } from './PartnerSalesPanel'
import { getPartnerSeasonStats, getPartnerRecentSales } from '@/lib/partner/partner-data'
import type { PoolQuery } from '@/lib/tickets/sold-seats'

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

  // Active admin language: the saved choice (payload-lng cookie, written by the
  // native account-settings selector) wins; otherwise the role-based default.
  // This mirrors how Payload's chrome resolves language, so switching in account
  // settings flips both the chrome and this custom copy. (Issue #234, ADR-0015.)
  const cookieLang = (await cookies()).get(ADMIN_LANG_COOKIE)?.value
  const lang = resolveAdminLang({ cookieLang, role: (user as { role?: string } | null)?.role })

  // Partner is authenticated but is NOT internal staff (isAuthed excludes it),
  // so branch here before the staff-only login guard below.
  if (isPartner(user as { role?: string } | null)) {
    return <PartnerDashboard payload={payload} user={user} lang={lang} />
  }

  if (!isAuthed(user as { role?: string } | null)) {
    redirect(`/admin/login?redirect=${encodeURIComponent('/admin')}`)
  }

  const role = (user as { role?: string }).role
  const adminTier = isAdminTier(user as { role?: string })

  if (!adminTier) {
    return <TehnikaDashboard role={role} lang={lang} />
  }

  const input = await getStatsInput()
  const { header, rows } = computeStats(input)

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 16, fontSize: 24 }}>{adminT(lang, 'dashboard')}</h1>

      <HeaderBlock header={header} />

      <AdminActions />

      <h2 style={{ fontSize: 16, margin: '24px 0 8px' }}>Shows (last 7 days + upcoming)</h2>
      <ShowsTable rows={rows} />

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        {adminT(lang, 'signedInAs')} {role}.
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

// Action-first door dashboard (#240, ADR-0015). A volunteer on a phone in a
// queue leads with the action: a large live admitted/sold progress hero for the
// active door show, then a dominant full-width scan button opening the in-page
// html5-qrcode viewfinder (never a native-camera-first flow). No revenue, no PII.
async function TehnikaDashboard({ role, lang }: { role?: string; lang: AdminLang }) {
  const next = await getNextShow()
  const scanned = next ? await getScannedPeopleForShow(next.id) : 0
  const progress = doorProgress(next, scanned)

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 560, margin: '0 auto' }}>
      {progress ? (
        <DoorProgressHero next={next!} progress={progress} lang={lang} />
      ) : (
        <p
          style={{
            background: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 8,
            padding: '32px 20px',
            color: 'var(--theme-elevation-600)',
            textAlign: 'center',
            fontSize: 18,
            marginBottom: 24,
          }}
        >
          {adminT(lang, 'noShowTonight')}
        </p>
      )}

      {/* Dominant full-width, thumb-height scan button → in-page viewfinder. */}
      <Link
        href="/admin/scan"
        style={{
          display: 'block',
          width: '100%',
          padding: '24px 16px',
          fontSize: 22,
          fontWeight: 700,
          background: 'var(--theme-success-500, #1f7a3a)',
          color: 'white',
          border: 'none',
          borderRadius: 12,
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        {adminT(lang, 'scanTicket')}
      </Link>

      {next ? (
        <div style={{ marginTop: 20 }}>
          <TicketLookupPanel showId={next.id} />
        </div>
      ) : null}

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        {adminT(lang, 'signedInAs')} {role}.
      </p>
    </div>
  )
}

// The one number that matters at the door: admitted / sold, as a progress ring
// with the live "X / Y ušlo" figure. Brand gold + Bodoni on the big number;
// Payload theme tokens keep it dark-mode safe.
function DoorProgressHero({
  next,
  progress,
  lang,
}: {
  next: NextShow
  progress: { admitted: number; sold: number; percent: number }
  lang: AdminLang
}) {
  const ring = 200
  const stroke = 16
  const r = (ring - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (progress.percent / 100) * circ

  return (
    <div
      style={{
        background: 'var(--theme-elevation-50)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 12,
        padding: '24px 20px',
        marginBottom: 20,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-500)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {formatShowDate(next.date)} · {next.time} · {VENUE_LABEL[next.venue] ?? next.venue}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 4px' }}>
        <svg width={ring} height={ring} viewBox={`0 0 ${ring} ${ring}`} role="img" aria-label={`${progress.admitted} / ${progress.sold} ${adminT(lang, 'admittedLabel')}`}>
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            fill="none"
            stroke="var(--theme-elevation-150)"
            strokeWidth={stroke}
          />
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            fill="none"
            stroke="var(--cecilija-gold, #c9a227)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
          />
          <text
            x="50%"
            y="46%"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontFamily: 'var(--cecilija-bodoni, Georgia, serif)',
              fontSize: 44,
              fontWeight: 700,
              fill: 'var(--theme-elevation-1000)',
            }}
          >
            {progress.admitted} / {progress.sold}
          </text>
          <text
            x="50%"
            y="64%"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: 16,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fill: 'var(--theme-elevation-500)',
            }}
          >
            {adminT(lang, 'admittedLabel')}
          </text>
        </svg>
      </div>
    </div>
  )
}

// Scoped dashboard shell for the `partner` role (ADR-0008, ADR-0006 pattern).
// This slice (#143) establishes the role, the scoped landing, and the empty
// sidebar; the sell form, own-stats and same-day storno land in later slices.
// The layout here is HITL-reviewed before #143 is considered done.
type PartnerRecord = { id: number | string; name?: string; active?: boolean; commissionPercent?: number }

async function PartnerDashboard({
  payload,
  user,
  lang,
}: {
  payload: Awaited<ReturnType<typeof getPayload>>
  user: unknown
  lang: AdminLang
}) {
  const partnerId = partnerIdOf(user as { role?: string; partner?: unknown } | null)

  let partner: PartnerRecord | null = null
  if (partnerId != null) {
    try {
      partner = (await payload.findByID({
        collection: 'partners',
        id: partnerId,
        depth: 0,
      })) as unknown as PartnerRecord
    } catch {
      partner = null
    }
  }

  const wrap: React.CSSProperties = { padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 880, margin: '0 auto' }
  const notice: React.CSSProperties = {
    background: 'var(--theme-elevation-50)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 8,
    padding: 20,
    color: 'var(--theme-elevation-600)',
  }

  // Misconfigured login (no linked partner) or a deactivated partner: never
  // show org data — just a clear message. Ownership is fail-safe by design.
  if (!partner) {
    return (
      <div style={wrap}>
        <h1 style={{ marginBottom: 16, fontSize: 24 }}>{adminT(lang, 'partnerDashboard')}</h1>
        <div style={notice}>
          This account isn’t linked to a partner yet. Please contact HGD Sveta Cecilija to finish setup.
        </div>
      </div>
    )
  }

  if (partner.active === false) {
    return (
      <div style={wrap}>
        <h1 style={{ marginBottom: 16, fontSize: 24 }}>{partner.name}</h1>
        <div style={notice}>
          This partner account is currently inactive. Please contact HGD Sveta Cecilija.
        </div>
      </div>
    )
  }

  // Active upcoming shows the partner can sell, with live remaining capacity.
  const upcoming = await getUpcomingShows()
  const sellShows: SellShow[] = upcoming.map((s) => ({
    id: String(s.id),
    label: `${formatShowDate(s.date)} · ${s.time} · ${VENUE_LABEL[s.venue] ?? s.venue}`,
    remaining: s.remaining,
  }))

  // Same-day storno window (#145) plus own-scoped season stats + recent sales
  // (#146). All queries are scoped to this partner's id.
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)
  const numericPartnerId = Number(partner.id)
  const [todaySales, seasonStats, recentSales] = await Promise.all([
    getPartnerTodaySales(partner.id, { query: poolQuery }),
    getPartnerSeasonStats(poolQuery, numericPartnerId),
    getPartnerRecentSales(poolQuery, numericPartnerId, 5),
  ])

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: 6, fontSize: 24 }}>{partner.name}</h1>
      <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 24 }}>{adminT(lang, 'partnerDashboard')}</p>

      <div style={{ marginBottom: 24 }}>
        <PartnerSellForm shows={sellShows} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <PartnerStornoList sales={todaySales} />
      </div>

      <PartnerSalesPanel
        stats={seasonStats}
        recent={recentSales}
        commissionPercent={partner.commissionPercent ?? 10}
      />

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        Signed in as partner.
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

