import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleJoinClaim, JOIN_CLAIM_TTL_MS } from '@/lib/app/join'
import {
  findJoinCode,
  insertJoinClaim,
  makeJoinPairing,
  makeJoinSecret,
  poolQuery,
} from '@/lib/app/join-store'
import { loadJoinMember, memberHasLogin } from '@/lib/app/join-data'
import { joinClaimCookie } from '@/lib/app/join-cookie'
import { joinRateLimiter } from '@/lib/rate-limit/join-rate-limit'
import { clientIpFromHeaders } from '@/lib/rate-limit/claim-rate-limit'

// POST /api/app/join — a dancer taps their own name at a rehearsal (#463).
//
// Wiring only; the rules are in `src/lib/app/join.ts` and the SQL in
// `join-store.ts`.
//
// **Unauthenticated and it writes a row**, which is the one shape this codebase
// treats with suspicion (`/api/app/forgot` is the other). Three things stand in
// front of it: the `/app` cross-site guard, a throttle sized for a hall full of
// dancers behind one NAT (`join-rate-limit.ts`), and the fact that what it
// writes is a REQUEST rather than an account. Nothing exists until a voditelj
// approves it from `/app`.
//
// The reply carries the device's claim secret as an httpOnly cookie, never in
// the body: it is the credential that later turns into a session, so no script
// on the page should be able to read it.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const query = poolQuery(payload)
  const body = await req.json().catch(() => null)

  const result = await handleJoinClaim(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    now: () => Date.now(),
    allow: (code) => joinRateLimiter.allow(code, clientIpFromHeaders(req.headers)),
    loadCode: (code) => findJoinCode(query, code),
    loadMember: (memberId) => loadJoinMember(payload, memberId),
    memberHasLogin: (memberId) => memberHasLogin(payload, memberId),
    makeSecret: makeJoinSecret,
    makePairing: makeJoinPairing,
    insertClaim: (row) => insertJoinClaim(query, row),
  })

  const response = NextResponse.json(result.body, { status: result.status })
  if (result.secret) {
    response.headers.set(
      'Set-Cookie',
      joinClaimCookie(result.secret, JOIN_CLAIM_TTL_MS / 1000, req),
    )
  }
  return response
}
