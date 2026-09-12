import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { can, type PermissionUser } from '@/lib/access/permissions'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleConsent } from '@/lib/mcp/authorize'
import { issueAuthorizationCode, mcpResourceUrl } from '@/lib/mcp/oauth'
import { oauthStoreFor } from '@/lib/mcp/oauth-store'

// POST /api/app/authorize — the consent decision behind `/app/authorize` (#438).
//
// Not a `requirePermission` route, and that is deliberate: the two refusals a
// consent screen owes are DIFFERENT sentences ("prijavi se" versus "Claude se
// može povezati samo s računom voditelja"), and the rules that decide them live
// in the pure `handleConsent` along with the request validation. What this file
// does is authenticate, resolve `moreska`, and wire the code issuer.
//
// It carries `appRequestMeta` + the cross-site guard like every other
// cookie-authenticated `/app` POST: issuing an authorization code from a
// cross-site form is precisely the attack that guard exists for. It answers
// JSON with a `redirect` rather than a 302, because the caller is a fetch from
// the consent page and the browser has to follow the redirect itself.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  const body = await req.json().catch(() => null)

  const result = await handleConsent(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    userId: user ? String(user.id) : null,
    isVoditelj: can(user as PermissionUser, 'moreska'),
    issueCode: (params) => issueAuthorizationCode(oauthStoreFor(payload), params),
    resourceUrl: mcpResourceUrl(),
  })

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
