import { NextResponse } from 'next/server'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleJoinStatus } from '@/lib/app/join'
import { findClaimBySecret, markJoinClaimUsed } from '@/lib/app/join-store'
import { clearJoinClaimCookie, joinSecretFrom } from '@/lib/app/join-cookie'
import { getRepo } from '@/lib/repo'

// POST /api/app/join/status — the dancer's phone, waiting (#463).
//
// Wiring only; the rules are in `src/lib/app/join.ts`. Both halves go through
// the seam since #511: `repo.db.query` for the claim store, and
// `repo.auth.openSession` for the session an approval ends in — the first of
// the login operations to cross the seam, because this route is where a
// voditelj's yes becomes somebody's sign-in.
//
// It authenticates with the claim cookie and nothing else, which is the point:
// the device that asked is the device that gets in. On `approved` the answer
// carries TWO cookies, the session and the removal of the claim, because from
// that moment the claim is spent and the dancer is an ordinary signed-in user.
//
// A POST although it mostly reads: it writes when the answer is yes, and the
// `/app` cross-site guard has something to check only when there is a content
// type to require.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const repo = getRepo()
  const query = repo.db.query

  const result = await handleJoinStatus({
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    now: () => Date.now(),
    secret: joinSecretFrom(req),
    loadClaimBySecret: (secret) => findClaimBySecret(query, secret),
    markClaimUsed: (claimId) => markJoinClaimUsed(query, claimId),
    openSession: (userId) => repo.auth.openSession(userId),
  })

  const response = NextResponse.json(result.body, { status: result.status })
  const cookies: string[] = []
  if (result.setCookie) cookies.push(result.setCookie)
  if (result.clearJoinCookie) cookies.push(clearJoinClaimCookie(req))
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie)
  return response
}
