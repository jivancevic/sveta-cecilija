import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getShowStatsInput } from '@/lib/show-stats-data'
import { computeShowStats } from '@/lib/show-stats'
import { isAdminTier } from '@/lib/access/roles'
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
  const adminView = isAdminTier(user as { role?: string })
  return <AdminShowStatsBody header={header} orders={orders} adminView={adminView} />
}
