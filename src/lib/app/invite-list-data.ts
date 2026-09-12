import { getPayload } from 'payload'
import config from '@payload-config'
import { loadMemberIdsWithLogin, type UserLinkFinder } from '@/lib/access/member-logins'
import { inviteCandidates, type InviteCandidate, type InviteRosterMember } from './invite-link'

// The IO wiring behind `/app/pozivnice` (#463) — the `link-self-data.ts` shape:
// the Payload calls and nothing else, so WHO is on the list stays in the pure,
// unit-tested `invite-link.ts`.
//
// Two queries, both `overrideAccess: true` and both already run elsewhere for
// the same reasons: the roster read is society-wide because the caller has
// cleared the `/app` access decision and holds `moreska`, and
// `loadMemberIdsWithLogin` answers "does a login exist" and never "what is in
// it" (it fills the Members list column with the same query).
//
// The mobile rides along, which the self-link's list deliberately does not
// carry: it is the number the SMS deep link dials, this screen belongs to a
// voditelj, and a mobile is the side of the PII boundary `/app` may cross
// (ADR-0024). An e-mail still is not, and none is read here.

export async function getInviteCandidates(): Promise<InviteCandidate[]> {
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

  const members = (roster.docs ?? []) as unknown as InviteRosterMember[]
  return inviteCandidates(members, withLogin)
}
