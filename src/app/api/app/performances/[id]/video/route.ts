import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleVideoSave } from '@/lib/app/video'

// POST /api/app/performances/[id]/video — the Snimka's link (#692).
//
// `requirePermission(req, 'moreska')` (CLAUDE.md hard rule): the local API runs
// `overrideAccess: true`, so the field lock on `Shows.videoUrl` does NOT gate
// this handler. None of the three sanctioned exceptions applies — there is no
// token in this request, there is a session by definition, and nobody is being
// authenticated.
//
// This write rings NOBODY, and that is a property of the watched set rather
// than of this route: `diffPerformance` (`src/lib/push/performance-change.ts`)
// watches the date, the time, the place, the cancellation and the voditelj note,
// and `videoUrl` is none of them, so the `afterChange` hook produces an empty
// diff. Announcing the video is a separate press on `video/notify`. If anybody
// ever adds `videoUrl` to that watched set, this route starts ringing the roster
// on every typo fix and the one-ring lock next door becomes a lie.
//
// The write still goes THROUGH the collection (`payload.update`), for `note.ts`'s
// reason: one writer of a shows row, so the hooks that do matter keep running.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  const { id } = await params
  const body = await req.json().catch(() => null)

  const result = await handleVideoSave(id, body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadPerformance: async (performanceId) => {
      try {
        const doc = await payload.findByID({
          collection: 'shows',
          id: performanceId,
          depth: 0,
          overrideAccess: true,
        })
        // A row with no kind cannot be classified, so it is treated as one the
        // handler will refuse rather than as a redovna by default.
        return doc ? { kind: String((doc as { kind?: unknown }).kind ?? '') } : null
      } catch {
        // A bad id is a 400 from the handler, never a 500 from here.
        return null
      }
    },

    saveVideo: (performanceId, url) =>
      payload.update({
        collection: 'shows',
        id: performanceId,
        // Widened the way `/api/app/note` widens its own single-field update,
        // and for the same reason: `data` is typed from the generated
        // `payload-types.ts`, which this repo deliberately does not commit.
        data: { videoUrl: url } as Parameters<typeof payload.update>[0]['data'],
        overrideAccess: true,
        // Carried so Payload attributes the change to the voditelj who made it.
        user,
      }),
  })

  return NextResponse.json(result.body, { status: result.status })
}
