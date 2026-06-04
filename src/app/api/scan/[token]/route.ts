import { NextRequest, NextResponse } from 'next/server'
import { scanToken, canUndoScan } from '@/lib/scan-token'
import { buildScanDeps } from '@/lib/scan-deps'
import { isAuthed } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const gate = await requireRole(req, isAuthed)
  if (gate.error) return gate.error

  const { token } = await params
  const deps = await buildScanDeps()
  const result = await scanToken(token, deps, { viewer: 'staff' })
  const undoEligible =
    result.status === 'ALREADY_SCANNED' ? canUndoScan(result.scannedAt) : false
  return NextResponse.json({ token, result, undoEligible })
}
