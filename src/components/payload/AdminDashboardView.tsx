import React from 'react'
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getStatsInput } from '@/lib/stats-data'
import { ADMIN_LANG_COOKIE, adminT, resolveAdminLang, type AdminLang } from '@/lib/admin-i18n'
import { isAdminTier, isAuthed, isPartner, partnerIdOf } from '@/lib/access/roles'
import { getNextShow, getScannedPeopleForShow, getUpcomingShows, type NextShow } from '@/lib/shows'
import { toDashboardShows } from '@/lib/dashboard/from-stats'
import { partitionShows } from '@/lib/dashboard/partition'
import { seasonCapacity } from '@/lib/dashboard/capacity'
import { SeasonBand } from './dashboard/SeasonBand'
import { getDashboardMoney } from '@/lib/dashboard/revenue-data'
import { UpcomingHero } from './dashboard/UpcomingHero'
import { PastShowsList } from './dashboard/PastShowsList'
import { SeasonTrajectoryChart } from './dashboard/SeasonTrajectoryChart'
import { ChannelMixChart } from './dashboard/ChannelMixChart'
import { getActiveTicketCountsByChannel } from '@/lib/tickets/sold-seats'
import { doorProgress, type DoorProgress } from '@/lib/dashboard/door-progress'
import { TicketLookupPanel } from './TicketLookupPanel'
import { PartnerSellForm, type SellShow } from './PartnerSellForm'
import { PartnerRecentSales } from './PartnerRecentSales'
import { getPartnerRecentSalesPage } from '@/lib/partner/recent-sales-page'
import { PartnerSalesPanel } from './PartnerSalesPanel'
import { getPartnerSeasonStats } from '@/lib/partner/partner-data'
import { buildStatistikaBars } from '@/lib/partner/partner-stats'
import { getPartnerMonthToDate } from '@/lib/partner/month-to-date'
import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import { PartnerMonthToDateCard } from './PartnerMonthToDateCard'
import type { PoolQuery } from '@/lib/tickets/sold-seats'
import { countInquiries, type InquiryRow } from '@/lib/dashboard/inquiries'
import { InquiriesBadge } from './InquiriesBadge'
import { gatherDevDiagnostics } from '@/lib/dev-diagnostics/gather'
import { getStripeBalanceSummary } from '@/lib/dev-diagnostics/stripe-balance'
import { SuperadminDevStrip } from './SuperadminDevStrip'

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

  // Upcoming-show-first secretary dashboard (#238, ADR-0015). The whole season
  // (un-windowed) is partitioned into upcoming vs past; the hero leads with the
  // next show + fill bar + remaining seats, the season band persists on top.
  //
  // Superadmin-only dev strip (#235/#244, ADR-0016): gatherDevDiagnostics is the
  // gating chokepoint — it returns null (and runs no queries) for admin/tehnika/
  // partner, so the work only happens for a superadmin, and each probe inside is
  // fail-soft so it can never break the dashboard. Fetched in parallel with the
  // stats input and the season money facts.
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)
  const [input, diagnostics, money, channelTickets] = await Promise.all([
    getStatsInput(),
    gatherDevDiagnostics(user as { role?: string } | null, {
      query: poolQuery,
      stripeBalance: getStripeBalanceSummary,
    }),
    // Two season money facts (#237): revenue collected (online net of refunds +
    // in-person cash) and partner receivable, computed apart, never summed.
    getDashboardMoney(poolQuery),
    // Channel-mix chart (#242): online vs partner active-ticket counts. In-person
    // sales have no ticket rows, so they come from shows.inPersonSold below.
    getActiveTicketCountsByChannel(poolQuery),
  ])
  const dashboardShows = toDashboardShows(input.shows)
  const { upcoming, past } = partitionShows({ today: input.today, shows: dashboardShows })
  const season = seasonCapacity(dashboardShows)

  // Season channel mix (#242): online + partner from tickets, in-person summed
  // from the shows' box-office counters.
  const channelCounts = {
    online: channelTickets.online,
    partner: channelTickets.partner,
    inPerson: input.shows.reduce((sum, s) => sum + s.inPersonSold, 0),
  }

  // Live inquiries badge (#239): count `new` enquiries + the booking sub-count.
  // Cheap query — one collection, `new` only — and force-dynamic already opts
  // this page out of caching, so it refreshes on every load.
  const newEnquiries = await payload.find({
    collection: 'contact-submissions',
    where: { status: { equals: 'new' } },
    select: { status: true, enquiryType: true },
    limit: 0,
    depth: 0,
    pagination: false,
  })
  const inquiries = countInquiries(newEnquiries.docs as InquiryRow[])

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 40px)', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 16, fontSize: 24 }}>{adminT(lang, 'dashboard')}</h1>

      {/* Persistent season summary band — visible without scrolling. The two
          money figures come from getDashboardMoney (#237): revenue collected
          (online net of refunds + in-person cash) and partner receivable,
          computed apart and never summed. */}
      <SeasonBand
        lang={lang}
        season={season}
        revenueCents={money.revenueCollectedCents}
        partnerReceivableCents={money.partnerReceivableCents}
      />

      {/* Live inquiries badge (#239): "<n> new, incl. <m> booking enquiries",
          linking into the filtered list. Rendered as its own strip above the
          action row (it replaces the old static "Inquiries" action link). */}
      <div style={{ margin: '16px 0' }}>
        <InquiriesBadge lang={lang} count={inquiries.count} bookingCount={inquiries.bookingCount} />
      </div>

      <AdminActions lang={lang} />

      <div style={{ marginTop: 24 }}>
        <UpcomingHero upcoming={upcoming} lang={lang} />
        <PastShowsList past={past} lang={lang} />
      </div>

      {/* Season charts (#242): per-show sold trajectory + season channel mix. */}
      <SeasonTrajectoryChart shows={dashboardShows} lang={lang} />
      <ChannelMixChart counts={channelCounts} lang={lang} />

      {diagnostics && <SuperadminDevStrip data={diagnostics} />}

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        {adminT(lang, 'signedInAs')} {role}.
      </p>
    </div>
  )
}

function AdminActions({ lang }: { lang: AdminLang }) {
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
        {adminT(lang, 'newShow')}
      </Link>
      {/* "Record in-person sale" used to live here and dead-ended on the raw
          Shows list. It's now an inline per-show control on each upcoming-show
          card (RecordSaleControl, #243). Global row is just New show + Find
          order. */}
      <Link href="/admin/collections/orders" style={button}>
        {adminT(lang, 'findOrder')}
      </Link>
      {/* The "Inquiries" action link is replaced by the live InquiriesBadge
          strip rendered above the action row (#239). */}
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
  progress: DoorProgress
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
            stroke="var(--cecilija-gold, #B8881A)"
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
  const commissionPercent = partner.commissionPercent ?? 10

  // Live month-to-date standing card (#241): the current Europe/Zagreb month,
  // resolved here so the data layer takes no clock. monthKeyInZagreb buckets the
  // sale date the same way the month-end statement does, so the two agree.
  const now = new Date()
  const { year, month } = monthKeyInZagreb(now.toISOString())

  const [recentPage, seasonStats, monthToDate, allShowsRes] = await Promise.all([
    getPartnerRecentSalesPage(poolQuery, numericPartnerId, { page: 1, pageSize: 3 }),
    getPartnerSeasonStats(poolQuery, numericPartnerId),
    getPartnerMonthToDate(poolQuery, { partnerId: numericPartnerId, commissionPercent, year, month }),
    // ALL active season performances (Statistika shows every izvedba, not only
    // the ones this partner sold).
    poolQuery(`SELECT id, date FROM shows WHERE status = 'active' ORDER BY date`, []),
  ])

  const allShows = allShowsRes.rows.map((r) => {
    const d = (r as { id: unknown; date: unknown }).date
    return {
      showId: String((r as { id: unknown }).id),
      showDate: d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10),
    }
  })
  const statBars = buildStatistikaBars(allShows, seasonStats.perShow)

  const monthLabel = now.toLocaleDateString(lang === 'hr' ? 'hr-HR' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Zagreb',
  })

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: 6, fontSize: 24 }}>{partner.name}</h1>
      <p style={{ color: 'var(--theme-elevation-600)', marginBottom: 24 }}>{adminT(lang, 'partnerDashboard')}</p>

      <div style={{ marginBottom: 24 }}>
        <PartnerSellForm shows={sellShows} lang={lang} />
      </div>

      {/* Recent orders sit directly under the sell flow — selling + checking what
          was just sold is the partner's everyday loop; the stats live below it. */}
      <div style={{ marginBottom: 24 }}>
        <PartnerRecentSales initial={recentPage} lang={lang} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <PartnerMonthToDateCard data={monthToDate} monthLabel={monthLabel} lang={lang} />
      </div>

      <PartnerSalesPanel stats={seasonStats} statBars={statBars} lang={lang} />

      <p style={{ fontSize: 13, color: 'var(--theme-elevation-600)', marginTop: 24 }}>
        {adminT(lang, 'helpHeading')}{' '}
        <a
          href={`mailto:admin@moreska.eu?subject=${encodeURIComponent(
            `${adminT(lang, 'mailSubject')} (${partner.name})`,
          )}`}
          style={{ color: 'var(--theme-success-600, #1f7a3a)', fontWeight: 600 }}
        >
          {adminT(lang, 'helpContact')}
        </a>
      </p>
      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 8 }}>
        {adminT(lang, 'signedInAs')} {partner.name}.
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

