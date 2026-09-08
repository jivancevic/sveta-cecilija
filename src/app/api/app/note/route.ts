import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleNoteSave } from '@/lib/app/note'

// POST /api/app/note — the voditelj note, saved from `/app` (#436, story 25).
//
// `requirePermission(req, 'moreska')`: the note is a message to the whole
// roster and the local API runs `overrideAccess: true`, so the field lock on
// `Shows.voditeljNote` does NOT gate this handler — the guard does (CLAUDE.md
// hard rule). The `/app` cross-site guard is inside the pure handler, as on
// every other cookie-authenticated `/app` POST.
//
// The write is `payload.update` on the collection, deliberately and not as a
// convenience: the Shows `afterChange` hook is what tells the roster the note
// changed, and a raw SQL update would leave a note edited from the phone silent
// while the same edit from `/admin` rang everybody.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const body = await req.json().catch(() => null)

  const result = await handleNoteSave(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    performanceExists: async (id) => {
      try {
        const doc = await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })
        return Boolean(doc)
      } catch {
        // A bad id is a 400 from the handler, never a 500 from here.
        return false
      }
    },

    saveNote: (id, note) =>
      payload.update({
        collection: 'shows',
        id,
        data: { voditeljNote: note } as never,
        overrideAccess: true,
        // Carried so Payload attributes the change to the voditelj who made it,
        // the way an admin save is attributed.
        user,
      }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
