import React from 'react'
import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getStatsInput } from '@/lib/stats-data'
import { ADMIN_LANG_COOKIE, adminT, resolveAdminLang, type AdminLang } from '@/lib/admin-i18n'
import { partnerIdOf, type PartnerUser } from '@/lib/access/partner'
import { dashboardBranchFor } from '@/lib/dashboard/branch'
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
import { PromoCodeSalesPanel } from './dashboard/PromoCodeSalesPanel'
import { CompMemberCountsPanel } from './dashboard/CompMemberCountsPanel'
import {
  getActiveTicketCountsByChannel,
  getActiveTicketCountsByPromoCode,
  getActiveTicketCountsByShowAndChannel,
  getCompCountsByMember,
} from '@/lib/tickets/sold-seats'
import { doorProgress, type DoorProgress } from '@/lib/dashboard/door-progress'
import { TicketLookupPanel } from './TicketLookupPanel'
import { PartnerSellForm, type SellShow } from './PartnerSellForm'
import { CompIssuePanel } from './CompIssuePanel'
import type { CompMember } from './CompIssueForm'
import { PartnerRecentSales } from './PartnerRecentSales'
import { getPartnerRecentSalesPage } from '@/lib/partner/recent-sales-page'
import { PartnerSalesPanel } from './PartnerSalesPanel'
import { getPartnerSeasonStats, getStatistikaShows } from '@/lib/partner/partner-data'
import { buildStatistikaBars } from '@/lib/partner/partner-stats'
import { getPartnerMonthToDate } from '@/lib/partner/month-to-date'
import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import { PartnerMonthToDateCard } from './PartnerMonthToDateCard'
import type { PoolQuery } from '@/lib/tickets/sold-seats'
import { countInquiries, type InquiryRow } from '@/lib/dashboard/inquiries'
import { InquiriesBadge } from './InquiriesBadge'
import { buildMemberSeason } from '@/lib/member/season'
import { getSeasonTicketRowsByShow, getSeasonOfflineTypesByShow } from '@/lib/member/season-data'
import { MemberSeasonDashboard } from './MemberSeasonDashboard'
import { gatherDevDiagnostics } from '@/lib/dev-diagnostics/gather'
import { getStripeBalanceSummary } from '@/lib/dev-diagnostics/stripe-balance'
import { SuperadminDevStrip } from './SuperadminDevStrip'

export const dynamic = 'force-dynamic'

const VENUE_LABEL: Record<string, string> = {
  'ljetno-kino': 'Ljetno kino',
  'zimsko-kino': 'Centar za kulturu',
}

// Replaces Payload's default collection-card dashboard. Rendered for /admin.
// Branches on the permission set through the pure dashboardBranchFor() (#395):
//   - partner:      own sell form, own sales, own stats. Never org data.
//   - season_stats: the shared society season view (ADR-0022). Read-only.
//   - door:         next-show-only block + Scan-a-ticket button. No season
//                   aggregate, no revenue, no other shows (ADR-0006 /
//                   CONTEXT.md "Stats dashboard").
//   - tickets:      season aggregate + action row + show table.
//   - none:         nothing to show — back to the login page.
export async function AdminDashboardView() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  // Active admin language: the saved choice (payload-lng cookie, written by the
  // native account-settings selector) wins; otherwise the role-based default.
  // This mirrors how Payload's chrome resolves language, so switching in account
  // settings flips both the chrome and this custom copy. (Issue #234, ADR-0015.)
  const cookieLang = (await cookies()).get(ADMIN_LANG_COOKIE)?.value
  const lang = resolveAdminLang({ cookieLang, user: user as { permissions?: unknown } | null })

  // Who the footer line names. The permission set is not a job title, so the
  // account's own username is what "Signed in as" shows now.
  const signedInAs =
    (user as { username?: string; email?: string } | null)?.username ??
    (user as { email?: string } | null)?.email ??
    ''

  const branch = dashboardBranchFor(user as { permissions?: unknown } | null)

  // A partner or the shared society login is authenticated but is NOT internal
  // staff, so each gets its own scoped view; `none` means an authenticated
  // account with no dashboard at all, which goes back to the login page.
  if (branch === 'partner') {
    return <PartnerDashboard payload={payload} user={user} lang={lang} />
  }

  if (branch === 'season_stats') {
    return <MemberDashboard payload={payload} lang={lang} />
  }

  if (branch === 'door') {
    return <TehnikaDashboard signedInAs={signedInAs} lang={lang} />
  }

  if (branch !== 'tickets') {
    redirect(`/admin/login?redirect=${encodeURIComponent('/admin')}`)
  }

  // Upcoming-show-first secretary dashboard (#238, ADR-0015). The whole season
  // (un-windowed) is partitioned into upcoming vs past; the hero leads with the
  // next show + fill bar + remaining seats, the season band persists on top.
  //
  // Dev-only dev strip (#235/#244, ADR-0016): gatherDevDiagnostics is the
  // gating chokepoint — it returns null (and runs no queries) for anyone
  // without the `dev` permission, so the work only happens for a `dev` holder,
  // and each probe inside is fail-soft so it can never break the dashboard. Fetched in parallel with the
  // stats input and the season money facts.
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)
  const [
    input,
    diagnostics,
    money,
    channelTickets,
    channelTicketsByShow,
    promoCodeSales,
    compsByMember,
  ] = await Promise.all([
    getStatsInput(),
    gatherDevDiagnostics(user as { permissions?: unknown } | null, {
      query: poolQuery,
      stripeBalance: getStripeBalanceSummary,
    }),
    // Two season money facts (#237): revenue collected (online net of refunds +
    // in-person cash) and partner receivable, computed apart, never summed.
    getDashboardMoney(poolQuery),
    // Channel-mix chart (#242): online vs partner active-ticket counts. In-person
    // sales have no ticket rows, so they come from shows.inPersonSold below.
    getActiveTicketCountsByChannel(poolQuery),
    // The same split PER SHOW, for the stacked season-trajectory bars: it is
    // what turns each bar from one flat total into online / at the door /
    // partner / comp. At-the-door seats have no ticket rows, so the chart
    // derives them as the remainder of the show's `sold`.
    getActiveTicketCountsByShowAndChannel(poolQuery),
    // Promo-code reporting panel (#325, ADR-0018): per-code whole-party active
    // tickets + revenue, top draw first. Cancelled/refunded excluded upstream.
    getActiveTicketCountsByPromoCode(poolQuery),
    // Comps-per-member report (#323, ADR-0019): active comp tickets grouped by
    // the attributed member, with the adult/child split. Cancelled excluded.
    getCompCountsByMember(poolQuery),
  ])
  const dashboardShows = toDashboardShows(input.shows)
  const { upcoming, past } = partitionShows({ today: input.today, shows: dashboardShows })
  const season = seasonCapacity(dashboardShows)

  // Season channel mix (#242): online + partner from tickets, at-the-door from
  // the two offline counters. BOTH of them: since ADR-0025 the show cards count
  // legacy seats as sold, so a chart that summed only `inPersonSold` would read
  // 48 under a card reading 123 on 2026-05-18.
  const channelCounts = {
    online: channelTickets.online,
    partner: channelTickets.partner,
    inPerson: input.shows.reduce((sum, s) => sum + s.inPersonSold + s.legacyReserved, 0),
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

  // Comp-issue flow (#318, ADR-0019): active upcoming shows to give away seats
  // for, plus the active members to attribute them to. Both feed the admin-only
  // comp-issue action below.
  const [compUpcoming, membersRes] = await Promise.all([
    getUpcomingShows(),
    payload.find({
      collection: 'members',
      where: { active: { equals: true } },
      sort: 'name',
      limit: 1000,
      depth: 0,
    }),
  ])
  const compShows: SellShow[] = compUpcoming.map((s) => ({
    id: String(s.id),
    label: `${formatShowDate(s.date)} · ${s.time} · ${VENUE_LABEL[s.venue] ?? s.venue}`,
    remaining: s.remaining,
  }))
  const compMembers: CompMember[] = membersRes.docs.map((d) => ({
    id: String(d.id),
    name: (d.name as string) ?? '',
  }))

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
        compsIssued={channelTickets.comp}
      />

      {/* Live inquiries badge (#239): "<n> new, incl. <m> booking enquiries",
          linking into the filtered list. Rendered as its own strip above the
          action row (it replaces the old static "Inquiries" action link). */}
      <div style={{ margin: '16px 0' }}>
        <InquiriesBadge lang={lang} count={inquiries.count} bookingCount={inquiries.bookingCount} />
      </div>

      <AdminActions lang={lang} />

      {/* Comp (goodwill) ticket issue — admin-only action that opens a
          partner-style form (#318, ADR-0019). */}
      <div style={{ marginTop: 12 }}>
        <CompIssuePanel shows={compShows} members={compMembers} lang={lang} />
      </div>

      <div style={{ marginTop: 24 }}>
        <UpcomingHero upcoming={upcoming} lang={lang} />
        <PastShowsList past={past} lang={lang} />
      </div>

      {/* Season charts (#242): per-show sold trajectory + season channel mix. */}
      <SeasonTrajectoryChart
        shows={dashboardShows}
        channelsByShow={channelTicketsByShow}
        lang={lang}
      />
      <ChannelMixChart counts={channelCounts} lang={lang} />

      {/* Promo-code reporting (#325, ADR-0018): top codes by tickets sold, with
          the partner "show 3 → show more" expand pattern. */}
      <PromoCodeSalesPanel rows={promoCodeSales} lang={lang} />

      {/* Comps-per-member report (#323, ADR-0019): flat table of goodwill comp
          tickets issued per member, biggest recipient first. */}
      <CompMemberCountsPanel rows={compsByMember} lang={lang} />

      {diagnostics && <SuperadminDevStrip data={diagnostics} />}

      <p style={{ fontSize: 11, color: 'var(--theme-elevation-400)', marginTop: 24 }}>
        {adminT(lang, 'signedInAs')} {signedInAs}.
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
async function TehnikaDashboard({ signedInAs, lang }: { signedInAs: string; lang: AdminLang }) {
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
        {adminT(lang, 'signedInAs')} {signedInAs}.
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

// Season ticket view for the shared `member` login (#362, ADR-0022).
//
// Two reads, both already-established seams: getStatsInput for the season's
// performances (raw per-show counters, with `date` normalized to YYYY-MM-DD) and
// one grouped ticket query for the adult/child + channel split. The season
// filter, the box-office sum and every rollup live in the pure
// buildMemberSeason(); this function only wires data to it.
//
// Note it feeds buildMemberSeason the RAW StatsShow rows, not toDashboardShows()
// — the secretary dashboard's `sold` drops legacyReserved, which still occupies
// a seat and so must count here (ADR-0022).
//
// Deliberately does NOT reuse the secretary dashboard's money/action pieces: no
// figure on this page is derived from `orders.total`, and it renders no links.
async function MemberDashboard({
  payload,
  lang,
}: {
  payload: Awaited<ReturnType<typeof getPayload>>
  lang: AdminLang
}) {
  const pool = (payload.db as unknown as { pool: { query: PoolQuery } }).pool
  const poolQuery: PoolQuery = (sql, params) => pool.query(sql, params)

  const [input, ticketRows, offlineTypesByShow] = await Promise.all([
    getStatsInput(),
    getSeasonTicketRowsByShow(poolQuery),
    // Since ADR-0025 door and legacy seats carry a ticket type, so they join the
    // ordinary adult/child split instead of sitting in a typeless bucket.
    getSeasonOfflineTypesByShow(poolQuery),
  ])

  const season = buildMemberSeason({
    today: input.today,
    shows: input.shows,
    ticketRows,
    offlineTypesByShow,
  })

  return <MemberSeasonDashboard season={season} lang={lang} />
}

// Scoped dashboard shell for a `partner` login (ADR-0008, ADR-0006 pattern).
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
  const partnerId = partnerIdOf(user as PartnerUser)

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

  const [recentPage, seasonStats, monthToDate, allShows] = await Promise.all([
    getPartnerRecentSalesPage(poolQuery, numericPartnerId, { page: 1, pageSize: 3 }),
    getPartnerSeasonStats(poolQuery, numericPartnerId),
    getPartnerMonthToDate(poolQuery, { partnerId: numericPartnerId, commissionPercent, year, month }),
    // Every active PUBLIC season performance (Statistika shows every izvedba the
    // partner could sell, not only the ones they did — and never a non-public
    // one, which they could never sell; #407).
    getStatistikaShows(poolQuery),
  ])

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

