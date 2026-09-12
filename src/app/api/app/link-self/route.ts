import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { resolveOwnMemberId, type MemberLinkReader } from '@/lib/access/attendance-access'
import { relationIdForWrite as relId } from '@/lib/payload-relation'
import { handleLinkSelf, type LinkSelfMember } from '@/lib/app/link-self'

// POST /api/app/link-self — "Poveži svoj račun s članom" (#462, ADR-0024).
//
// Wiring only: every rule (who may be claimed, what is refused, the twice-run
// exclusivity check) lives in `src/lib/app/link-self.ts` and is unit-tested
// there.
//
// `requirePermission(req, 'moreska')` FIRST, then the `/app` cross-site guard,
// the order every `/app` write route uses. It matters more here than usual:
// this handler writes `Users.member`, a field locked to a `users` holder for
// read AND write, with `overrideAccess: true`. The lock is exactly what is
// being worked around, so the permission check in this handler is the only
// thing standing in its place — the local API gates nothing (CLAUDE.md hard
// rule), and the screen that calls this is UX, never the boundary.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload, user } = gate

  // The caller's own link, re-read server-side: the session's copy may predate
  // an administrator's relink, and "do you already have one" is the refusal
  // that keeps this route from being a way to become somebody else.
  const callerMemberId = await resolveOwnMemberId(
    payload as unknown as MemberLinkReader,
    // `member` is deliberately NOT read off the session here: `resolveOwnMemberId`
    // would trust it and skip the re-read.
    { id: user.id },
  )

  const body = await req.json().catch(() => null)

  const result = await handleLinkSelf(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    caller: {
      id: user.id,
      permissions: Array.isArray((user as { permissions?: unknown }).permissions)
        ? ((user as { permissions?: unknown[] }).permissions as unknown[])
        : [],
      // Both fields are field-locked to `users`, and both still reach us:
      // Payload's JWT strategy loads the account through the local API with
      // `overrideAccess: true`, the same reason `permissions` gets here.
      shared: (user as { shared?: unknown }).shared === true,
    },
    callerMemberId: callerMemberId == null ? null : String(callerMemberId),

    loadMember: async (id): Promise<LinkSelfMember | null> => {
      const doc = (await payload.findByID({
        collection: 'members',
        id,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown> | null
      if (!doc) return null
      return {
        id: doc.id as string | number,
        name: typeof doc.name === 'string' ? doc.name : null,
        nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
        roles: Array.isArray(doc.roles) ? doc.roles : [],
        primaryRole: typeof doc.primaryRole === 'string' ? doc.primaryRole : null,
        active: doc.active !== false,
        isMoreskant: doc.isMoreskant === true,
      }
    },

    // `limit: 2`, not 1: the answer this feeds is "is anybody else here", and
    // after the write the caller's own row is one of the hits.
    findUserIdsByMember: async (memberId) => {
      const found = await payload.find({
        collection: 'users',
        where: { member: { equals: relId(memberId) } },
        limit: 2,
        depth: 0,
        overrideAccess: true,
      })
      return found.docs.map((doc) => String((doc as { id: unknown }).id))
    },

    link: async (userId, data) => {
      await payload.update({
        collection: 'users',
        id: userId,
        data: { member: relId(data.member), permissions: data.permissions } as never,
        overrideAccess: true,
      })
    },

    unlink: async (userId, data) => {
      await payload.update({
        collection: 'users',
        id: userId,
        data: { member: null, permissions: data.permissions } as never,
        overrideAccess: true,
      })
    },
  })

  return NextResponse.json(result.body, { status: result.status })
}
