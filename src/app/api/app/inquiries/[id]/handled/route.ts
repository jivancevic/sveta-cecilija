import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleMarkHandled } from '@/lib/app/inquiries-handled'
import { getRepo } from '@/lib/repo'

// POST /api/app/inquiries/[id]/handled — the enquiry lifecycle (#507).
//
// The one write Upiti makes, and the Cecilija replacement for the Backoffice's
// "Mark handled" edit-menu item, which reached Payload's REST directly. Same
// column, same two values, same idempotence; what changes is that the rules are
// now in a pure module that can be tested and the gate is the one every staff
// route uses.
//
// `requirePermission(req, 'tickets')` is that gate (CLAUDE.md hard rule): the
// local API runs `overrideAccess: true` inside the seam, so the collection
// access on `contact-submissions` does NOT gate this handler. The `/app`
// cross-site guard sits inside the pure handler, as on every other
// cookie-authenticated `/app` write.
//
// The body says what the row should BE (`{ handled: true | false }`), not what
// to do to it, so the undo is the same route and a retry is harmless.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error
  const { user } = gate

  const { id } = await params
  const body = await req.json().catch(() => null)
  const repo = getRepo()

  const result = await handleMarkHandled(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadInquiry: async (inquiryId) => {
      const inquiry = await repo.inquiries.byId(inquiryId)
      return inquiry ? { status: inquiry.status } : null
    },

    // The write context: the collection's hooks and Payload's attribution see
    // who marked it, exactly as they do for a Backoffice save.
    setHandled: (inquiryId, handled) => repo.inquiries.setHandled(inquiryId, handled, { user }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
