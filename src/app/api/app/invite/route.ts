import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/access/route-guard'
import { appRequestMeta } from '@/lib/app/request-guard'
import { handleInvite, type InviteMember, type InviteUser } from '@/lib/app/invite'
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
// **The expiration argument only works because the Users auth config sets no
// `forgotPassword.expiration`.** Payload reads
// `collectionConfig.auth?.forgotPassword?.expiration ?? expiration ?? 3600000`
// (`node_modules/payload/dist/auth/operations/forgotPassword.js`), so a
// collection value would WIN over what this route passes and freeze the
// invitation and the reset at one length. See the note on Users.auth.

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

    findUserByMember: async (memberId): Promise<InviteUser | null> => {
      const found = await payload.find({
        collection: 'users',
        where: { member: { equals: memberId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const row = found.docs[0] as unknown as Record<string, unknown> | undefined
      if (!row) return null
      return {
        id: row.id as string | number,
        username: typeof row.username === 'string' ? row.username : null,
        email: typeof row.email === 'string' ? row.email : null,
      }
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
      return {
        id: doc.id as string | number,
        username: typeof doc.username === 'string' ? doc.username : null,
        email: typeof doc.email === 'string' ? doc.email : null,
      }
    },

    updateUserEmail: async (id, email) => {
      await payload.update({
        collection: 'users',
        id,
        data: { email } as never,
        overrideAccess: true,
      })
    },

    issueResetToken: async (target, expirationMs) => {
      const token = await payload.forgotPassword({
        collection: 'users',
        // Payload types `data` as `{ email }` from the generated types this repo
        // does not commit; the operation itself reads `username` too
        // (loginWithUsername, ADR-0011) and `target` is exactly one of the two.
        data: target as Parameters<typeof payload.forgotPassword>[0]['data'],
        // We send our own Croatian mail; Payload's default English one would
        // point at /admin/reset, which no dancer may open.
        disableEmail: true,
        expiration: expirationMs,
      })
      return typeof token === 'string' ? token : null
    },

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
