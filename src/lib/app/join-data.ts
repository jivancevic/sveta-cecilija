import { getPayload } from 'payload'
import config from '@payload-config'
import { loadMemberIdsWithLogin, type UserLinkFinder } from '@/lib/access/member-logins'
import { memberEligibility, type LinkSelfMember } from './link-self'
import { ensureDancerLogin, type InviteMember } from './invite'
import { createLoginDeps } from './invite-data'
import {
  currentJoinCode,
  findJoinCode,
  pendingJoinClaims,
  poolQuery,
  type PendingClaim,
} from './join-store'
import { codeIsLive, type JoinLoginOutcome, type JoinMember } from './join'

// The Payload half of the rehearsal join code (#463) — the `link-self-data.ts`
// shape: the CMS calls and nothing else, so WHO may be claimed stays in the
// pure, unit-tested `join.ts` and the SQL stays in `join-store.ts`.
//
// Every call runs `overrideAccess: true`, as the rest of `/app` does: the local
// API gates nothing (CLAUDE.md hard rule). That matters more here than usual,
// because one of these reads happens for a caller with NO session at all — the
// dancer scanning the QR — so what is safe to hand over is decided by the
// projection rather than by a collection rule.

type PayloadClient = Awaited<ReturnType<typeof getPayload>>

/** One name on the public list. A projection: no mobile, no e-mail, no roles. */
export interface JoinCandidate {
  id: string
  name: string
  nickname: string | null
}

/**
 * What `/app/join/<kod>` shows: active moreškanti with no login, names only.
 *
 * **The projection is the privacy boundary.** This page is public by design
 * (the person scanning has not signed in and cannot, which is the point), so it
 * carries the minimum a dancer needs to recognise themselves and nothing a
 * stranger could collect: no mobile, no e-mail, no dance roles, no attendance.
 * ADR-0024's rule is that a mobile may cross into `/app` and an e-mail may not;
 * on an unauthenticated page neither does.
 *
 * A dancer who already has a login is absent, which is the #462 eligibility
 * rule (`memberEligibility`) rather than a second definition of it.
 */
export async function getJoinCandidates(): Promise<JoinCandidate[]> {
  const payload = await getPayload({ config })

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

  const members = (roster.docs ?? []) as unknown as LinkSelfMember[]
  return members
    .filter((m) => memberEligibility(m, withLogin.has(String(m.id))) === null)
    .map((m) => ({
      id: String(m.id),
      name: typeof m.name === 'string' ? m.name : '',
      nickname: typeof m.nickname === 'string' ? m.nickname : null,
    }))
    .sort((a, b) =>
      (a.nickname || a.name).localeCompare(b.nickname || b.name, 'hr', { sensitivity: 'base' }),
    )
}

/** Is this code live right now? The page asks before it lists anybody. */
export async function joinCodeIsLive(code: string): Promise<boolean> {
  const payload = await getPayload({ config })
  const row = await findJoinCode(poolQuery(payload), code)
  return codeIsLive(row, Date.now())
}

/** The code the voditelj's screen shows, or null. */
export async function getCurrentJoinCode() {
  const payload = await getPayload({ config })
  return currentJoinCode(poolQuery(payload))
}

/** The queue on the voditelj's screen: claims still waiting for a yes. */
export async function getPendingJoinClaims(): Promise<PendingClaim[]> {
  const payload = await getPayload({ config })
  return pendingJoinClaims(poolQuery(payload))
}

/** One Member as the join rules read it: no contact details anywhere near it. */
export async function loadJoinMember(
  payload: PayloadClient,
  memberId: string,
): Promise<(JoinMember & InviteMember) | null> {
  try {
    const doc = (await payload.findByID({
      collection: 'members',
      id: memberId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown> | null
    if (!doc || doc.id == null) return null
    return {
      id: doc.id as string | number,
      name: typeof doc.name === 'string' ? doc.name : null,
      nickname: typeof doc.nickname === 'string' ? doc.nickname : null,
      // The e-mail rides along for ONE reason: `ensureDancerLogin` puts it on
      // the login it opens when the Member has one. It never leaves the server.
      email: typeof doc.email === 'string' ? doc.email : null,
      isMoreskant: doc.isMoreskant === true,
      active: doc.active !== false,
    }
  } catch {
    return null
  }
}

/** Does some login already point at this Member? The #462 question, again. */
export async function memberHasLogin(payload: PayloadClient, memberId: string): Promise<boolean> {
  const found = await payload.find({
    collection: 'users',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.length > 0
}

/** Open (or find) the login a claim ends in, for `handleJoinDecide`. */
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
