import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { listKeepersOf, loadShowRow, type ShowRowReader } from '@/lib/app/show-row'
import { handleLineupConfirm, type LineupPerformance } from '@/lib/lineup/replace'
import { listKeeperActor } from '@/lib/app/list-keeper-actor'
import { performanceKindOf } from '@/lib/show-performance'
import type { ViewerPayload } from '@/lib/app/viewer'
import { createLineupStore, type LineupStorePayload } from '@/lib/lineup/lineup-store'
import { setLineupConfirmationInTransaction } from '@/lib/lineup/write-tx'

// POST /api/app/lineup/confirm — "Potvrdi" and "Otključaj" (#432, story 31).
//
// One flag per evening, so one route: the body says which performance and
// whether it is now confirmed. Locking a lineup is what publishes it to every
// dancer (story 33) and what lets it count in the season statistics (#437,
// story 39), which is why it is a deliberate tap rather than a side effect of
// saving.
//
// The guard is the replace route's — `requirePermission(req,
// ['moreska','moreskant'])` plus the row question inside the pure handler
// (ADR-0029, #658) — for the reason that route has it, plus one more:
// confirming is the act a MCP tool is deliberately not given (#430, story 63),
// and widening the word here must not widen that. It does not: the MCP tools
// are gated on `moreska` in their own layer and reach this route not at all.
//
// Unlocking is the same question as confirming, deliberately. A postava is
// confirmed AFTER the night it records, so the moment a Zaduženi most needs is
// the one right after they pressed Potvrdi and saw a mistake.
//
// IT TAKES THE SAME ROW LOCK THE REPLACE TAKES, in the same order (#442
// review): without it a Potvrdi and a Spremi can interleave and the evening is
// locked around the list the voditelj had already replaced. Under the lock the
// route also refuses an empty postava and leaves an existing
// `lineupConfirmedAt` alone on a re-confirm — both are decisions about the
// state at the moment of the write, so both live in `write-tx.ts`.
//
// The save goes through the collection rather than raw SQL, so the Shows
// afterChange hook sees it. It diffs date, time, place, cancellation and the
// voditelj note only, so confirming a postava rings nobody's phone — the
// intended behaviour, asserted by `shows-hook-lineup.test.ts`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, ['moreska', 'moreskant'])
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)
  const store = createLineupStore(payload as unknown as LineupStorePayload, user)
  const actor = await listKeeperActor(payload as unknown as ViewerPayload, user)

  const result = await handleLineupConfirm(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    actor,

    // Read once, before the transaction, for the row question only. Everything
    // that has to be true AT THE MOMENT OF THE WRITE is re-read under the lock
    // in `write-tx.ts`; who may press the button is not one of those.
    loadPerformance: async (id): Promise<LineupPerformance | null> => {
      const doc = await loadShowRow(payload as unknown as ShowRowReader, id)
      if (!doc) return null
      return {
        id: String(doc.id),
        confirmed: doc.lineupConfirmed === true,
        kind: performanceKindOf(doc.kind),
        listKeepers: listKeepersOf(doc),
      }
    },

    setConfirmed: (performanceId, confirmed) =>
      setLineupConfirmationInTransaction(performanceId, confirmed, store),
  })

  return NextResponse.json(result.body, { status: result.status })
}
