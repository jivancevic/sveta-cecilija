import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { createPushDeps, type PushPayload } from '@/lib/push/push-data'
import { handleRosterMessage } from '@/lib/push/roster-message'

// POST /api/app/notifications/message — the voditelj's own sentence (#654).
//
// `requirePermission(req, 'moreska')` (CLAUDE.md hard rule): Obavijesti is a
// Više row every account the access decision admits can open, so the SCREEN is
// not the gate — this is. The button is hidden from a reader without `moreska`
// rather than greyed with "traži Moreška" (that rule is Izvedbe's, #567, and
// exists so a blagajna knows who to ask; nobody has to ask for permission to
// write to the dancers), and hiding a control is never authorization: the same
// request typed by hand is refused here with 403.
//
// None of the three sanctioned exceptions to the guard applies: there is no
// token in this request, there is a session by definition, and nobody is being
// authenticated. The rules and the two counts live in `roster-message.ts`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const body = await req.json().catch(() => null)
  const deps = createPushDeps(payload as unknown as PushPayload)

  const result = await handleRosterMessage(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    loadMoreskanti: deps.loadMoreskanti,
    loadUserIdsByMember: deps.loadUserIdsByMember,
    send: deps.send,
  })

  return NextResponse.json(result.body, { status: result.status })
}
