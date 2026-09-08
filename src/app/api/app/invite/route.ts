import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleInvite, type InviteMember } from '@/lib/app/invite'
import { issueAppResetToken, toInviteUser } from '@/lib/app/account-data'
import { sendMoreskantEmail } from '@/lib/email/send-moreskant-email'

// POST /api/app/invite — "Pošalji pozivnicu" (#424, ADR-0024).
//
// Wiring only: every rule (the four refusals, the reverse lookup that makes a
// second press idempotent, the username slug, the seven-day expiration) lives
// in `src/lib/app/invite.ts` and is unit-tested there.
//
// `requirePermission(req, 'moreska')` FIRST, before the cross-site guard and
// before any Payload read: this route creates an account and sends mail, and
// the local API runs `overrideAccess: true`, so the collection access on
// Members and Users gates nothing here (CLAUDE.md hard rule). The edit-menu
// item that calls it is UX, never the boundary.
//
// The seven-day expiration below is passed per call and works only because the
// Users auth config sets none; the reason is written once, next to that config
// in `src/collections/Users.ts`.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requirePermission(req, 'moreska')
  if (gate.error) return gate.error
  const { payload } = gate

  const body = await req.json().catch(() => null)

  const result = await handleInvite(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? '',

    loadMember: async (id): Promise<InviteMember | null> => {
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
        email: typeof doc.email === 'string' ? doc.email : null,
        isMoreskant: doc.isMoreskant === true,
        active: doc.active !== false,
      }
    },

    findUserByMember: async (memberId) => {
      const found = await payload.find({
        collection: 'users',
        where: { member: { equals: memberId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return toInviteUser(found.docs[0] as unknown as Record<string, unknown> | undefined)
    },

    usernameTaken: async (candidate) => {
      const found = await payload.find({
        collection: 'users',
        where: { username: { equals: candidate } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return found.docs.length > 0
    },

    createUser: async (data) => {
      const doc = (await payload.create({
        collection: 'users',
        data: data as never,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
      const user = toInviteUser(doc)
      if (!user) throw new Error('users.create returned no id')
      return user
    },

    updateUserEmail: async (id, email) => {
      await payload.update({
        collection: 'users',
        id,
        data: { email } as never,
        overrideAccess: true,
      })
    },

    issueResetToken: (target, expirationMs) => issueAppResetToken(payload, target, expirationMs),

    sendInvite: (mail) =>
      sendMoreskantEmail(
        { kind: 'invite', ...mail },
        { fetch, brevoApiKey: process.env.BREVO_API_KEY ?? '' },
      ),

    // Never emailed, never used: the dancer sets their own from the link. It
    // exists only because Payload's local strategy requires a password on
    // create.
    randomPassword: () => crypto.randomBytes(32).toString('hex'),
  })

  return NextResponse.json(result.body, { status: result.status })
}
