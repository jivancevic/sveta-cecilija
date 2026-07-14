import { NextRequest, NextResponse } from 'next/server'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET  /api/comp/members — active members for the comp-issue picker.
// POST /api/comp/members — create a member inline ("+ Add member") without
// leaving the issue form (ADR-0019, #318). Admin-tier only: the local API runs
// overrideAccess, so the role is re-checked in-handler (CLAUDE.md hard rule).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  const res = await payload.find({
    collection: 'members',
    where: { active: { equals: true } },
    sort: 'name',
    limit: 1000,
    depth: 0,
  })
  const members = res.docs.map((d) => ({ id: String(d.id), name: (d.name as string) ?? '' }))
  return NextResponse.json({ members })
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

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

  const doc = await payload.create({
    collection: 'members',
    data: { name, active: true },
  })
  return NextResponse.json({ member: { id: String(doc.id), name: (doc.name as string) ?? name } })
}
