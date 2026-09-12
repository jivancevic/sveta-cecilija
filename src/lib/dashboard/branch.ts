// Which dashboard a signed-in user lands on at /admin (ADR-0023, #395).
//
// Pure function of the permission set, so the branching rule is unit-tested
// rather than buried in the dashboard component's control flow. The component
// switches on the result and renders the matching view.
//
// Evaluation order is `partner → season_stats|finance → door → editor →
// tickets → none`, and every scoped branch is guarded with "and does not hold `tickets`". That
// guard is the whole subtlety: `tickets` is the general backoffice, and the
// people who hold it also hold narrower permissions (the secretary holds `door`
// so she can scan; the developer holds every one). Without the guard, Tatjana
// would land on the door dashboard and the developer on the partner one. So the
// scoped branches mean "this account does the ONE scoped thing", and a
// `tickets` holder always gets the backoffice regardless of what else is in the
// set.
//
// `editor` is the fifth scoped branch (#500). It needs one because `none` is a
// redirect to the login page and Payload's login view redirects a signed-in
// user straight back here: a content editor holding nothing else would bounce
// between the two forever. Its landing is a two-link page into Objave and FAQ.
//
// `finance` rides the `season_stats` branch (#500): until the Financije screen
// ships in Cecilija, a money holder without `tickets` gets the same read-only
// counts view. It is evaluated before `door` on purpose, so Velebit, who holds
// `finance` + `door`, lands on the counts view rather than the door dashboard.
//
// `none` is not a screen: it means an authenticated account with nothing to
// show, which the dashboard turns into a redirect to the login page.

import { can, hasAny, type PermissionUser } from '@/lib/access/permissions'

export type DashboardBranch =
  | 'partner'
  | 'season_stats'
  | 'door'
  | 'editor'
  | 'tickets'
  | 'none'

export function dashboardBranchFor(user: PermissionUser): DashboardBranch {
  const backoffice = can(user, 'tickets')
  if (can(user, 'partner') && !backoffice) return 'partner'
  if (hasAny(user, ['season_stats', 'finance']) && !backoffice) return 'season_stats'
  if (can(user, 'door') && !backoffice) return 'door'
  if (can(user, 'editor') && !backoffice) return 'editor'
  if (backoffice) return 'tickets'
  return 'none'
}
