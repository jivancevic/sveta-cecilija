import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { createPushDeps, type PushPayload } from '@/lib/push/push-data'
import { activeMoreskantIds, rosterMessageAudience } from '@/lib/push/roster-message'
import { handleVideoNotification } from '@/lib/push/video-notification'

// POST /api/app/performances/[id]/video/notify — the one ring per evening (#692).
//
// `requirePermission(req, 'moreska')` (CLAUDE.md hard rule), and here the guard
// is the only thing standing in front of seventy-six phones: the button is drawn
// on the izvedba detail, which a `tickets` holder also opens, so a control being
// absent from their screen is not authorization. None of the three sanctioned
// exceptions applies.
//
// The audience is computed by #654's own functions rather than by a second rule
// of its own. That reuse is deliberate: "every active moreškant" has to mean the
// same set in both places, or the two confirmation sheets promise different
// things with the same sentence.
//
// The claim is `performance_notifications` type `'video'`. It is the lock AND
// the receipt — the screen reads it back through `readNotificationClaim` to
// print "Obavijest poslana: …" — so there is no second record of the send to
// disagree with it. It is deliberately never released: a video of an evening
// that later moves is still that evening's video, which is why
// `CLAIMS_INVALIDATED_BY_A_MOVE` lists only the alarm and the reminder.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const { id } = await params
  const body = await req.json().catch(() => null)
  const deps = createPushDeps(payload as unknown as PushPayload)

  const result = await handleVideoNotification(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),

    loadPerformance: async () => {
      try {
        const doc = await payload.findByID({
          collection: 'shows',
          id,
          depth: 0,
          overrideAccess: true,
        })
        if (!doc) return null
        const row = doc as { date?: unknown; kind?: unknown; videoUrl?: unknown }
        return {
          id,
          // `shows.date` comes back from Payload as a string here, but a raw pg
          // read of the same column hands back a Date (a gotcha this repo has
          // paid for), so it is normalised to the YYYY-MM-DD the copy expects.
          date: String(row.date ?? '').slice(0, 10),
          kind: String(row.kind ?? ''),
          videoUrl: typeof row.videoUrl === 'string' ? row.videoUrl : null,
        }
      } catch {
        return null
      }
    },

    loadAudience: async () => {
      const members = await deps.loadMoreskanti()
      const audience = rosterMessageAudience(
        members,
        await deps.loadUserIdsByMember(activeMoreskantIds(members)),
      )
      return { userIds: audience.userIds, withoutLogin: audience.withoutLogin }
    },

    claim: () => deps.claim(id, 'video'),
    send: deps.send,
    finalize: (devices) => deps.finalize(id, 'video', devices),
  })

  return NextResponse.json(result.body, { status: result.status })
}
