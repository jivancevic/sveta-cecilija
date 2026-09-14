import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleMarkStatementSent } from '@/lib/app/statement-sent'
import { freezePartnerStatement } from '@/lib/partner/load-statement'
import { monthKeyInZagreb } from '@/lib/partner/partner-reconciliation'
import { createStatementStore } from '@/lib/partner/statement-store'
import { getRepo } from '@/lib/repo'

// POST /api/app/statement/sent — **Označi poslanim** (#599).
//
// The one write Obračun makes, and the action that turns a live calculation
// into a settlement: marking a month sent stores the document as it stood, so
// the PDF the partner received and the PDF anyone downloads a year later are
// the same file. Un-marking returns the month to live.
//
// `requirePermission(req, 'finance')` is the gate, and `finance` ALONE
// (CLAUDE.md hard rule: the local API runs `overrideAccess: true` inside the
// seam, so the Partners collection access does not gate this handler). A
// partner may read their own statement and must never be able to declare it
// sent — the stamp is the society's record of what it posted, and both the
// stamp and the un-stamp belong to the person who does the posting.
//
// The body says what the month should BE (`{ sent: true | false }`), not what
// to do to it, so the undo is the same route and a retry is harmless.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'finance')
  if (gate.error) return gate.error
  const { user } = gate

  const body = await req.json().catch(() => null)
  const repo = getRepo()
  const store = createStatementStore(repo.db.query)

  const result = await handleMarkStatementSent(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    // The clock is resolved here, once, so the pure rule is a comparison and
    // the refusal is testable without mocking time.
    now: monthKeyInZagreb(new Date().toISOString()),

    loadPartner: async (partnerId) => {
      const partner = await repo.partners.byId(partnerId)
      return partner ? { id: partner.id } : null
    },

    isSent: async (partnerId, year, month) =>
      (await store.find(Number(partnerId), year, month)) != null,

    freeze: async (partnerId, year, month) => {
      // Re-read the Partner rather than trust the id: the rate and the address
      // frozen into the document must be the ones on the row at the moment of
      // stamping, which is what the accountant will be invoicing against.
      const partner = await repo.partners.byId(partnerId)
      if (!partner) return
      await freezePartnerStatement(repo.db.query, {
        partner,
        year,
        month,
        sentBy: Number(user.id),
        store,
      })
    },

    unfreeze: (partnerId, year, month) =>
      store.clearSent(Number(partnerId), year, month),
  })

  return NextResponse.json(result.body, { status: result.status })
}
