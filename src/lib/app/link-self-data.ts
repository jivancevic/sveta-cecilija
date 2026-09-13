import { loadRoster } from './members-data'
import { eligibleCandidates, type LinkSelfCandidate } from './link-self'

// The IO wiring behind "Poveži svoj račun s članom" (#462) — the
// `inquiries-data.ts` shape: the seam call and nothing else, so WHO may be
// claimed stays in the pure, unit-tested `link-self.ts` and the POST route
// re-applies exactly that rule to the row it is handed.
//
// It used to run its own two `payload.find`s, which is the allow-list entry
// #511 retired: the roster read and "does a login exist" are the two questions
// the Članovi list already asks through `repo.members`, so they are asked once.

export async function getSelfLinkCandidates(): Promise<LinkSelfCandidate[]> {
  const { members, idsWithLogin } = await loadRoster()
  return eligibleCandidates(members, idsWithLogin)
}
