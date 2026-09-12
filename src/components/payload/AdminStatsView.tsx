import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getShowStatsInput } from '@/lib/show-stats-data'
import { computeShowStats } from '@/lib/show-stats'
import { can, type PermissionUser } from '@/lib/access/permissions'
import { ADMIN_LANG_COOKIE, resolveAdminLang } from '@/lib/admin-i18n'
import { AdminShowStatsBody } from './AdminShowStatsView'

export const dynamic = 'force-dynamic'

type AdminStatsViewProps = {
  initPageResult?: { req?: { pathname?: string } }
}

function parseShowId(pathname: string | undefined): string | null {
  if (!pathname) return null
  const match = pathname.match(/\/stats\/([^/?#]+)\/?$/)
  return match ? match[1] : null
}

// Drill-down only now. The list view was collapsed into the /admin dashboard
// (AdminDashboardView). Bare /admin/stats redirects there; per-show pages
// /admin/stats/<showId> continue to render here. See ADR-0006.
export async function AdminStatsView(props: AdminStatsViewProps = {}) {
  const pathname = props.initPageResult?.req?.pathname
  const showId = parseShowId(pathname)

  if (!showId) redirect('/admin')

  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) {
    redirect(`/admin/login?redirect=${encodeURIComponent(`/admin/stats/${showId}`)}`)
  }

  const input = await getShowStatsInput(showId)
  if (!input) notFound()
  const { header, orders } = computeShowStats(input)
  // The PII columns (buyer name, email) are backoffice-only; a door account
  // reaching this page sees the anonymised view (ADR-0023).
  const adminView = can(user as PermissionUser, 'tickets')
  // Revenue is its own read since #500: `finance`, never `tickets`. The two are
  // deliberately independent — Tatjana holds both, Velebit only `finance`.
  const showMoney = can(user as PermissionUser, 'finance')
  const cookieLang = (await cookies()).get(ADMIN_LANG_COOKIE)?.value
  const lang = resolveAdminLang({ cookieLang, user: user as PermissionUser })
  return (
    <AdminShowStatsBody
      header={header}
      orders={orders}
      adminView={adminView}
      showMoney={showMoney}
      lang={lang}
    />
  )
}
