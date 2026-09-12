import crypto from 'crypto'
import type { getPayload } from 'payload'
import { issueAppResetToken, toInviteUser } from './account-data'
import type { InviteDeps, InviteMember } from './invite'
import type { AppRequestMeta } from './request-guard'
import { sendMoreskantEmail } from '@/lib/email/send-moreskant-email'

// The Payload half of the invitation, in one place (#424, extracted in #462).
//
// `handleInvite` is pure and knows nothing about Payload; this is everything it
// needs injected. It used to be written inline in `/api/app/invite`, which was
// right while there was one caller. There are two now — the per-Member action
// and the bulk "Pošalji pozivnice svima" — and two hand-copied sets of Payload
// calls is how "the Member's e-mail wins" ends up true on one route and not the
// other.
//
// Every call runs `overrideAccess: true`, as the rest of `/app` does: the local
// API gates nothing (CLAUDE.md hard rule), and both routes have already checked
// `moreska` in their handler.

type PayloadClient = Awaited<ReturnType<typeof getPayload>>

export function createInviteDeps(payload: PayloadClient, request: AppRequestMeta): InviteDeps {
  return {
    request,
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

    // `handleInvite` reads a THROW as "the letter did not go" and answers 502
    // with `invite.sendFailed`, which is the honest ending: the login exists and
    // the token is live, only the mail is missing, so pressing again is the fix.
    // The sender itself never throws (its caller has already created an
    // account by then), so the boolean is turned back into one here (#462
    // review). Without this a Brevo 401 or a rate limit reported success, and
    // the bulk action counted a dancer as invited who never heard from us.
    sendInvite: async (mail) => {
      const sent = await sendMoreskantEmail(
        { kind: 'invite', ...mail },
        { fetch, brevoApiKey: process.env.BREVO_API_KEY ?? '' },
      )
      if (!sent) throw new Error('Brevo refused the invitation mail')
    },

    // Never emailed, never used: the dancer sets their own from the link. It
    // exists only because Payload's local strategy requires a password on
    // create.
    randomPassword: () => crypto.randomBytes(32).toString('hex'),
  }
}
