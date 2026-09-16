import crypto from 'crypto'
import type { getPayload } from 'payload'
import { issueAppResetToken, toInviteUser } from './account-data'
import { ensureDancerLogin, type EnsureLoginDeps, type InviteDeps, type InviteMember } from './invite'
import type { JoinLoginOutcome } from './join'
import type { AppRequestMeta } from './request-guard'
import { sendMoreskantEmail } from '@/lib/email/send-moreskant-email'

// The Payload half of the invitation, in one place (#424, extracted in #462).
//
// `handleInvite` is pure and knows nothing about Payload; this is everything it
// needs injected. It used to be written inline in `/api/app/invite`, which was
// right while there was one caller. There are three now — the letter, "Kopiraj
// pozivnicu" and a voditelj approving a join claim — and hand-copied sets of
// Payload calls is how one door comes to grant something the others do not.
//
// Every call runs `overrideAccess: true`, as the rest of `/app` does: the local
// API gates nothing (CLAUDE.md hard rule), and both routes have already checked
// `moreska` in their handler.

type PayloadClient = Awaited<ReturnType<typeof getPayload>>

/**
 * The account half on its own: everything `ensureDancerLogin` needs and nothing
 * else (#463).
 *
 * A voditelj approving a join claim at a rehearsal opens the same login an
 * invitation would, but has no use for a mailer, a base URL or a member load —
 * it is holding the Member already. Splitting it here rather than writing four
 * more `payload.find` calls in `join-data.ts` is the same argument that moved
 * these out of the invite route in #462: two hand-copied sets of Payload calls
 * is how one door starts granting something the other does not.
 */
export function createLoginDeps(payload: PayloadClient): EnsureLoginDeps {
  return {
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

    // Never emailed, never used: since #463 the dancer signs in from the link
    // or the approval, and sets a password only if they ever want one. It
    // exists because Payload's local strategy requires one on create.
    randomPassword: () => crypto.randomBytes(32).toString('hex'),
  }
}

/**
 * Open (or find) the login a join claim ends in (#463).
 *
 * It lived in `join-data.ts` until #511 moved that module behind the seam: the
 * login half of the invitation is the one part of it that is still Payload's
 * own (`payload.create` on Users plus a reset token), so it belongs next to
 * `createLoginDeps` rather than alone in a module that no longer imports
 * Payload at all. It moves out of here with the rest of `repo.auth` (#475).
 */
export async function ensureJoinLogin(
  payload: PayloadClient,
  member: InviteMember,
): Promise<JoinLoginOutcome> {
  const outcome = await ensureDancerLogin(member, createLoginDeps(payload))
  if (!outcome.ok) return outcome
  return {
    ok: true,
    id: outcome.user.id,
    username: typeof outcome.user.username === 'string' ? outcome.user.username : '',
  }
}

export function createInviteDeps(payload: PayloadClient, request: AppRequestMeta): InviteDeps {
  return {
    ...createLoginDeps(payload),
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
        // For the SMS deep link of "Kopiraj pozivnicu" (#463). The letter is
        // addressed with the LOGIN's e-mail since #651 (ADR-0028), so a Member
        // row carries no address at all any more.
        mobile: typeof doc.mobile === 'string' ? doc.mobile : null,
        isMoreskant: doc.isMoreskant === true,
        active: doc.active !== false,
      }
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
  }
}
