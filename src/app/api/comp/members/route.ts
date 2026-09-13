import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { getRepo } from '@/lib/repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET  /api/comp/members — active members for the comp-issue picker.
// POST /api/comp/members — create a member inline ("+ Add member" / "Dodaj
// člana") without leaving the issue form (ADR-0019, #318). `tickets` only: the
// local API runs overrideAccess, so the permission is re-checked in-handler
// (CLAUDE.md hard rule).
//
// Both halves go through the repository seam since #506 (`repo.members`), which
// is what Gratis at `/app/comp` uses to render the picker on the server; the
// Backoffice comp form still calls this route for the same two things, so there
// is one list and one create behind both surfaces. The create is name-only by
// the shape of the seam method: a `tickets` holder may add a member but may not
// write the moreškant fields, and a field the method cannot carry is a field
// this route cannot leak.
export async function GET(req: NextRequest) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error

  const members = await getRepo().members.listActive()
  return NextResponse.json({ members })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const member = await getRepo().members.create(name, { user: gate.user })
  return NextResponse.json({ member })
}
