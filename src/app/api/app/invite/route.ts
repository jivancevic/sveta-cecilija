import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleInvite } from '@/lib/app/invite'
import { createInviteDeps } from '@/lib/app/invite-data'

// POST /api/app/invite — "Pošalji pozivnicu" (#424, ADR-0024).
//
// Wiring only: every rule (the four refusals, the reverse lookup that makes a
// second press idempotent, the username slug, the seven-day expiration) lives
// in `src/lib/app/invite.ts` and is unit-tested there, and the Payload calls it
// needs are `src/lib/app/invite-data.ts`, shared with the bulk action (#462).
//
// `requirePermission(req, 'moreska')` FIRST, before the cross-site guard and
// before any Payload read: this route creates an account and sends mail, and
// the local API runs `overrideAccess: true`, so the collection access on
// Members and Users gates nothing here (CLAUDE.md hard rule). The edit-menu
// item that calls it is UX, never the boundary.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const body = await req.json().catch(() => null)

  const result = await handleInvite(
    body,
    createInviteDeps(payload, appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL)),
  )

  return NextResponse.json(result.body, { status: result.status })
}
