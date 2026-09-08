import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { generateExpiredPayloadCookie } from 'payload/shared'
import config from '@payload-config'
import { handleAppLogout } from '@/lib/app/login'

// POST /api/app/logout — clears the shared Payload session cookie (#421).
// Always 200: signing out of a session that is already gone is a success. The
// expired cookie is Payload's own, so it matches the login cookie in name,
// path and attributes and actually removes it.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const payload = await getPayload({ config })
  const result = handleAppLogout({
    expiredCookie: () =>
      generateExpiredPayloadCookie({
        collectionAuthConfig: payload.collections.users.config.auth,
        cookiePrefix: payload.config.cookiePrefix,
      }),
  })

  const response = NextResponse.json(result.body, { status: result.status })
  if (result.setCookie) response.headers.set('Set-Cookie', result.setCookie)
  return response
}
