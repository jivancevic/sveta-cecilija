import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleBuyerEdit } from '@/lib/app/orders-buyer'
import { getRepo } from '@/lib/repo'

// PATCH /api/app/orders/[id]/buyer — the buyer's name and address (#501).
//
// The one write Narudžbe makes, and the only route this screen adds: Povrat,
// Pošalji ulaznice ponovno and Otvori PDF all call routes that already exist
// and are already guarded, because this screen is a port and not a rewrite.
//
// `requirePermission(req, 'tickets')` is the chokepoint every staff route uses
// (CLAUDE.md hard rule): the local API runs `overrideAccess: true`, so the
// collection access on `orders` does NOT gate this handler. The `/app`
// cross-site guard sits inside the pure handler, as on every other
// cookie-authenticated `/app` write — this is exactly the shape a cross-site
// `fetch` can aim at a signed-in blagajna's browser.
//
// The rules — a name is required, a blank address is NULL, a refunded order is
// closed — are in `lib/app/orders-buyer.ts` and tested there. The write goes
// through `repo.orders.updateBuyer`, which is `payload.update` inside the seam,
// so the Orders hooks run exactly as they do for a Backoffice edit.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'tickets')
  if (gate.error) return gate.error

  const { id } = await params
  const body = await req.json().catch(() => null)
  const repo = getRepo()

  const result = await handleBuyerEdit(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadOrder: async (orderId) => {
      const order = await repo.orders.staffDetailById(orderId)
      return order ? { refunded: order.refunded } : null
    },

    saveBuyer: (orderId, buyer) => repo.orders.updateBuyer(orderId, buyer),
  })

  return NextResponse.json(result.body, { status: result.status })
}
