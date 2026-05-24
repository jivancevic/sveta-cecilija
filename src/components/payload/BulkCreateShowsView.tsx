import React from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { BulkCreateShowsForm } from './BulkCreateShowsForm'

export const dynamic = 'force-dynamic'

export async function BulkCreateShowsView() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) redirect('/admin/login?redirect=/admin/bulk-create-shows')

  return <BulkCreateShowsForm />
}
