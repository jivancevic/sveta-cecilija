import { getRepo } from '@/lib/repo'
import { memberEligibility } from './link-self'
import type { InviteMember } from './invite'
import { loadRoster } from './members-data'
import {
  currentJoinCode,
  findJoinCode,
  pendingJoinClaims,
  type PendingClaim,
} from './join-store'
import { codeIsLive, type JoinMember } from './join'

// The IO wiring behind the rehearsal join code (#463) — the `inquiries-data.ts`
// shape: the seam calls and nothing else, so WHO may be claimed stays in the
// pure, unit-tested `join.ts` and the SQL stays in `join-store.ts`.
//
// It used to hold its own `getPayload`, which is the allow-list entry #511
// retired: the roster read is `repo.members`, and `app_join_codes` /
// `app_join_claims` are raw tables whose store already takes a `PoolQuery`, so
// it now takes `repo.db.query` instead of reaching into `payload.db`.
//
// One read here happens for a caller with NO session at all — the dancer
// scanning the QR — so what is safe to hand over is decided by the PROJECTION
// rather than by a collection rule.

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
  const { members, idsWithLogin } = await loadRoster()
  return members
    .filter((m) => memberEligibility(m, idsWithLogin.has(m.id)) === null)
    .map((m) => ({ id: m.id, name: m.name, nickname: m.nickname }))
    .sort((a, b) =>
      (a.nickname || a.name).localeCompare(b.nickname || b.name, 'hr', { sensitivity: 'base' }),
    )
}

/** Is this code live right now? The page asks before it lists anybody. */
export async function joinCodeIsLive(code: string): Promise<boolean> {
  const row = await findJoinCode(getRepo().db.query, code)
  return codeIsLive(row, Date.now())
}

/** The code the voditelj's screen shows, or null. */
export function getCurrentJoinCode() {
  return currentJoinCode(getRepo().db.query)
}

/** The queue on the voditelj's screen: claims still waiting for a yes. */
export function getPendingJoinClaims(): Promise<PendingClaim[]> {
  return pendingJoinClaims(getRepo().db.query)
}

/** One Member as the join rules read it: no contact details anywhere near it. */
export async function loadJoinMember(memberId: string): Promise<(JoinMember & InviteMember) | null> {
  const member = await getRepo().members.byId(memberId)
  if (!member) return null
  return {
    id: member.id,
    name: member.name,
    nickname: member.nickname,
    // The e-mail rides along for ONE reason: `ensureDancerLogin` puts it on the
    // login it opens when the Member has one. It never leaves the server.
    email: member.email,
    isMoreskant: member.isMoreskant,
    active: member.active,
  }
}

/** Does some login already point at this Member? The #462 question, again. */
export async function memberHasLogin(memberId: string): Promise<boolean> {
  return (await getRepo().members.idsWithLogin()).has(String(memberId))
}
