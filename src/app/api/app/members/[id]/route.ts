import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleMemberPatch } from '@/lib/app/members-edit'
import { createMember, loadMember, saveMember } from '@/lib/app/members-data'

// PATCH /api/app/members/[id] — one dancer's profile (#511).
//
// Wiring only; the rules are `handleMemberPatch` in
// `src/lib/app/members-edit.ts`, including WHICH fields a voditelj may send.
// That last part is the route's job rather than the collection's: the local API
// runs `overrideAccess: true` inside the seam, so the Members field locks do
// not apply to this write (CLAUDE.md hard rule: a form that must refuse a field
// refuses it in its route).
//
// `requirePermission(req, 'moreska')` first, then the `/app` cross-site guard
// inside the handler, the order every `/app` write route uses. A `moreskant`
// holder is refused here, and deliberately: reading the roster is a dancer's,
// editing somebody's profile is the voditelj's.
//
// A PATCH rather than a PUT because the body is a patch: only the keys that are
// present are written, so the profile form and a one-field action can share the
// route without either having to send the other's fields.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { user } = gate

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleMemberPatch(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    loadMember,
    // The write context: the collection hooks and Payload's attribution see who
    // edited the row, exactly as they do for a Backoffice save.
    save: (memberId, patch) => saveMember(memberId, patch, { user }),
    create: (input) => createMember(input, { user }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
