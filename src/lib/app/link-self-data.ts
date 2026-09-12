import { getPayload } from 'payload'
import config from '@payload-config'
import { loadMemberIdsWithLogin, type UserLinkFinder } from '@/lib/access/member-logins'
import { eligibleCandidates, type LinkSelfCandidate, type LinkSelfMember } from './link-self'

// The IO wiring behind the "Poveži svoj račun s članom" screen (#462) — the
// `roster-data.ts` shape: the Payload calls and nothing else, so WHO may be
// claimed stays in the pure, unit-tested `link-self.ts` and the POST route
// re-applies exactly that rule to the row it is handed.
//
// Two queries, both `overrideAccess: true`. The roster read is society-wide by
// the same argument as `roster-data.ts` (the caller has already cleared the
// `/app` access decision), and `loadMemberIdsWithLogin` answers "does a login
// exist" and never "what is in it" — the reason it already runs that way for
// the Members list column it fills.

export async function getSelfLinkCandidates(): Promise<LinkSelfCandidate[]> {
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
  return eligibleCandidates(members, withLogin)
}
