import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleMemberCreate } from '@/lib/app/members-edit'
import { createMember, loadMember, saveMember } from '@/lib/app/members-data'

// POST /api/app/members — "Dodaj plesača" on Članovi (#511).
//
// Wiring only; the rules are `handleMemberCreate` in
// `src/lib/app/members-edit.ts`.
//
// `requirePermission(req, 'moreska')` FIRST, then the `/app` cross-site guard
// inside the pure handler, the order every `/app` write route uses. It is not
// decoration: the local API runs `overrideAccess: true` inside the seam, so the
// Members collection access does NOT gate this handler (CLAUDE.md hard rule),
// and the screen that calls it is UX rather than the boundary.
//
// The row it writes is `isMoreskant: true` from the first save, which is what
// makes the collection's `beforeValidate` rules apply to it — a half-filled
// dancer never reaches the roster.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { user } = gate

  const body = await req.json().catch(() => null)

  const result = await handleMemberCreate(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    loadMember,
    save: (id, patch) => saveMember(id, patch, { user }),
    // The write context: the collection hooks and Payload's attribution see who
    // added the dancer, exactly as they do for a Backoffice save.
    create: (input) => createMember(input, { user }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
