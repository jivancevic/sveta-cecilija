import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleInviteLink } from '@/lib/app/invite'
import { createInviteDeps } from '@/lib/app/invite-data'

// POST /api/app/invite/link — "Kopiraj pozivnicu" (#463).
//
// Wiring only. The rules are `handleInviteLink` in `src/lib/app/invite.ts`,
// which shares its whole body with the mail route: the same username, the same
// `['moreskant']` bundle, the same reverse lookup, the same takeover guard and
// the same seven-day token. The Payload calls are `invite-data.ts`, shared with
// both other invitation callers.
//
// `requirePermission(req, 'moreska')` FIRST, before the cross-site guard and
// before any read: this route creates an account and returns a live sign-in
// link, which is a session in a text message. The local API runs
// `overrideAccess: true`, so nothing below this line gates it (CLAUDE.md hard
// rule), and the screen that calls it is UX rather than the boundary.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const body = await req.json().catch(() => null)

  const result = await handleInviteLink(
    body,
    createInviteDeps(payload, appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL)),
  )

  return NextResponse.json(result.body, { status: result.status })
}
