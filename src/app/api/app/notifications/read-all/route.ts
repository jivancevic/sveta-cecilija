import { NextResponse } from 'next/server'
import { requireAppSession } from '@/lib/app/session-guard'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'
import { markAllNotificationsRead } from '@/lib/app/notifications-store'

// POST /api/app/notifications/read-all — "Označi sve pročitanim" (#496).
//
// Same guard and the same reasoning as `[id]/read`: an account-scoped route
// with no permission word to name it, re-checked in the handler because the
// local API runs `overrideAccess: true`.
//
// It clears THIS account and nothing else, and only what is still unread, so
// re-running it is a no-op rather than a rewrite of everybody's timestamps.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rejection = rejectAppRequest(appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL))
  if (rejection) return NextResponse.json({ error: rejection.reason }, { status: rejection.status })

  const gate = await requireAppSession(req)
  if (gate.error) return gate.error

  const cleared = await markAllNotificationsRead(gate.query, gate.userId)
  return NextResponse.json({ ok: true, cleared })
}
