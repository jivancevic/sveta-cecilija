import { NextResponse } from 'next/server'
import { requireAppSession } from '@/lib/app/session-guard'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'
import { markNotificationRead } from '@/lib/app/notifications-store'

// POST /api/app/notifications/[id]/read — one row of the Sandučić obavijesti,
// marked read (#496).
//
// `requireAppSession` rather than `requirePermission` (`src/lib/app/session-guard.ts`):
// a notification is addressed to an ACCOUNT, so the question is the one the
// page gate asks — is this account inside Cecilija at all — and no permission
// word names it. It is still an in-handler re-check, which is the rule: the
// local API runs `overrideAccess: true` and `app_notifications` is a raw table
// with no collection access to begin with.
//
// The row's OWNER is re-checked in the SQL, not here: `markNotificationRead`
// carries `user_id` in its WHERE, so an id from somebody else's inbox is a 404
// and never a confirmation that the row exists.
//
// Cookie-authenticated POST, so it carries the `/app` cross-site guard like
// every other one.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejection = rejectAppRequest(appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL))
  if (rejection) return NextResponse.json({ error: rejection.reason }, { status: rejection.status })

  const gate = await requireAppSession(req)
  if (gate.error) return gate.error

  const { id } = await params
  const marked = await markNotificationRead(gate.query, gate.userId, id)
  if (!marked) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
