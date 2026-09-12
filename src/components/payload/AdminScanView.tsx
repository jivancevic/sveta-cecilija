import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { hasAny } from '@/lib/access/permissions'
import { ScanStationClient } from './ScanStationClient'

export const dynamic = 'force-dynamic'

// /admin/scan — inline scan SPA for the door. Auth-gates here so unauth'd
// requests never load the html5-qrcode bundle. Client component does
// camera + result overlay + calls POST /api/scan/[token] for the
// atomic mark-and-read.
export async function AdminScanView() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!hasAny(user as { permissions?: unknown } | null, ['door', 'tickets'])) {
    redirect(`/admin/login?redirect=${encodeURIComponent('/admin/scan')}`)
  }

  return <ScanStationClient />
}
