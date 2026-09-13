import { loadRoster } from './members-data'
import { inviteCandidates, type InviteCandidate } from './invite-link'

// The IO wiring behind the invitations list (#463), which Članovi absorbed
// (#511) — the `inquiries-data.ts` shape: the seam call and nothing else, so
// WHO is on the list stays in the pure, unit-tested `invite-link.ts`.
//
// It used to run two `payload.find`s of its own, which is the allow-list entry
// #511 retired: the roster read and "does a login exist" are the same two
// questions the Članovi list asks, so they are asked once, through
// `repo.members`, and both callers read the same answer.
//
// The mobile rides along, which the self-link's list deliberately does not
// carry: it is the number the SMS deep link dials, this list belongs to a
// voditelj, and a mobile is the side of the PII boundary `/app` may cross
// (ADR-0024). An e-mail still is not, and `inviteCandidates` does not project
// one.

export async function getInviteCandidates(): Promise<InviteCandidate[]> {
  const { members, idsWithLogin } = await loadRoster()
  // The roster read is society-wide; "an active moreškant" is one definition
  // (`memberEligibility`, #462) and `inviteCandidates` applies it.
  return inviteCandidates(members, idsWithLogin)
}
