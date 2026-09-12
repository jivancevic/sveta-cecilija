import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { loadMemberIdsWithLogin, type UserLinkFinder } from '@/lib/access/member-logins'
import { appRequestMeta, rejectAppRequest } from '@/lib/app/request-guard'
import { handleInvite } from '@/lib/app/invite'
import { createInviteDeps } from '@/lib/app/invite-data'
import { selectBulkInvites, summariseBulkInvites, type BulkMember } from '@/lib/app/invite-all'
import { APP_STRINGS } from '@/lib/app/strings'

// POST /api/app/invite/all — "Pošalji pozivnice svima koji nemaju" (#462).
//
// Wiring only, and deliberately thin: WHO is in the batch and what the voditelj
// is told are `src/lib/app/invite-all.ts`, and what an invitation IS remains
// `handleInvite`, called once per member. This route invents no invitation rule
// of its own — a second implementation of "the Member's e-mail wins" is exactly
// the drift the extraction into `invite-data.ts` exists to prevent.
//
// `requirePermission(req, 'moreska')` first, then the `/app` cross-site guard,
// the order every `/app` write route uses. The guard is applied HERE as well as
// inside each `handleInvite`, so a cross-site POST is refused before the roster
// is read rather than once per member.
//
// **Sequential on purpose.** Brevo's free tier is 300 mails a day and its API
// rate-limits a burst; the society is tens of dancers, so a loop that waits is
// a second of wall clock and no lost letters.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const request = appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL)
  const rejection = rejectAppRequest(request)
  if (rejection) {
    return NextResponse.json(
      { error: APP_STRINGS.inviteAll.unexpected },
      { status: rejection.status },
    )
  }

  const [roster, withLogin] = await Promise.all([
    payload.find({
      collection: 'members',
      where: { and: [{ isMoreskant: { equals: true } }, { active: { not_equals: false } }] },
      // The society has tens of members, not thousands: one unpaginated page.
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    loadMemberIdsWithLogin(payload as unknown as UserLinkFinder),
  ])

  const { send, noEmail } = selectBulkInvites(
    (roster.docs ?? []) as unknown as BulkMember[],
    withLogin,
  )

  const deps = createInviteDeps(payload, request)
  let sent = 0
  let failed = 0
  for (const memberId of send) {
    try {
      const result = await handleInvite({ memberId }, deps)
      if (result.status === 200) sent += 1
      else failed += 1
    } catch {
      failed += 1
    }
  }

  const outcome = { sent, noEmail: noEmail.length, failed }
  return NextResponse.json({ ok: true, ...outcome, message: summariseBulkInvites(outcome) })
}
