import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isAuthed } from '@/lib/access/roles'
import { ScanStationClient } from './ScanStationClient'

export const dynamic = 'force-dynamic'

// /admin/scan — inline scan SPA for tehnika. Auth-gates here so unauth'd
// requests never load the html5-qrcode bundle. Client component does
// camera + result overlay + calls POST /api/scan/[token] for the
// atomic mark-and-read.
export async function AdminScanView() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  if (!isAuthed(user as { role?: string } | null)) {
    redirect(`/admin/login?redirect=${encodeURIComponent('/admin/scan')}`)
  }

  return <ScanStationClient />
}
