import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'
import { APP_STRINGS } from '@/lib/app/strings'
import { poolQuery, rotateJoinCode } from '@/lib/app/join-store'

// POST /api/app/join/code — "Novi kod" on the voditelj's screen (#463).
//
// `requirePermission(req, 'moreska')` first, then the `/app` cross-site guard,
// then one write. There is no body: the only thing a caller can ask for is a
// fresh code, and rotating kills every live one, which is the whole point — a
// voditelj presses this because yesterday's QR is on somebody's camera roll.
//
// It is also how the FIRST code comes into existence; there is no seeding and
// no cron. A society that never presses it simply has no join code, and the
// rehearsal QR is one more thing that does not exist rather than a door left
// open by default.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const rejection = rejectAppRequest(appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL))
  if (rejection) {
    return NextResponse.json(
      { error: APP_STRINGS.join.unexpected },
      { status: rejection.status },
    )
  }

  try {
    const code = await rotateJoinCode(poolQuery(payload), user.id)
    return NextResponse.json({
      ok: true,
      code: code.code,
      expiresAt:
        code.expiresAt instanceof Date ? code.expiresAt.toISOString() : String(code.expiresAt),
    })
  } catch (err) {
    console.error('[join/code] rotation failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: APP_STRINGS.join.codeFailed }, { status: 500 })
  }
}
