import { NextRequest, NextResponse } from 'next/server'
import { refundOrder } from '@/lib/refund-order'
import { buildRefundOrderDeps } from '@/lib/refund/build-refund-order-deps'
import { isAdminTier } from '@/lib/access/roles'
import { requireRole } from '@/lib/access/route-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, isAdminTier)
  if (gate.error) return gate.error
  const { payload } = gate

  const { id } = await params

  try {
    const result = await refundOrder({ orderId: id }, buildRefundOrderDeps(payload, '[refund]'))
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
