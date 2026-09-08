import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleLineupConfirm, type LineupPerformance } from '@/lib/lineup/replace'

// POST /api/app/lineup/confirm — "Potvrdi" and "Otključaj" (#432, story 31).
//
// One flag per evening, so one route: the body says which performance and
// whether it is now confirmed, and the handler decides the timestamp. Locking
// a lineup is what publishes it to every dancer (story 33) and what lets it
// count in the season statistics (#437, story 39), which is why it is a
// deliberate tap rather than a side effect of saving.
//
// `requirePermission(req, 'moreska')` for the reason the replace route has it,
// plus one more: confirming is the act a MCP tool is deliberately not given
// (#430, story 63).
//
// The save goes through the collection rather than raw SQL, so the Shows
// afterChange hook sees it. It diffs date, time, place, cancellation and the
// voditelj note only, so confirming a postava rings nobody's phone — which is
// the intended behaviour, not an oversight.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)

  const result = await handleLineupConfirm(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadPerformance: async (id): Promise<LineupPerformance | null> => {
      try {
        const doc = (await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })) as unknown as Record<string, unknown> | null
        if (!doc) return null
        return { id: String(doc.id), confirmed: doc.lineupConfirmed === true }
      } catch {
        return null
      }
    },

    setConfirmed: (id, confirmed, at) =>
      payload.update({
        collection: 'shows',
        id,
        // Widened the way the note route widens its patch, and for the same
        // reason: `data` is typed from the generated `payload-types.ts`, which
        // this repo deliberately does not commit.
        data: {
          lineupConfirmed: confirmed,
          lineupConfirmedAt: at,
        } as Parameters<typeof payload.update>[0]['data'],
        overrideAccess: true,
        user,
      }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
