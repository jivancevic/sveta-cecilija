// Which dashboard a signed-in user lands on at /admin (ADR-0023, #395).
//
// Pure function of the permission set, so the branching rule is unit-tested
// rather than buried in the dashboard component's control flow. The component
// switches on the result and renders the matching view.
//
// Evaluation order is `partner → season_stats → door → tickets → none`, and the
// three scoped branches are guarded with "and does not hold `tickets`". That
// guard is the whole subtlety: `tickets` is the general backoffice, and the
// people who hold it also hold narrower permissions (the secretary holds `door`
// so she can scan; the developer holds all nine). Without the guard, Tatjana
// would land on the door dashboard and the developer on the partner one. So the
// scoped branches mean "this account does the ONE scoped thing", and a
// `tickets` holder always gets the backoffice regardless of what else is in the
// set.
//
// `none` is not a screen: it means an authenticated account with nothing to
// show, which the dashboard turns into a redirect to the login page.

import { can, type PermissionUser } from '@/lib/access/permissions'

export type DashboardBranch = 'partner' | 'season_stats' | 'door' | 'tickets' | 'none'

export function dashboardBranchFor(user: PermissionUser): DashboardBranch {
  const backoffice = can(user, 'tickets')
  if (can(user, 'partner') && !backoffice) return 'partner'
  if (can(user, 'season_stats') && !backoffice) return 'season_stats'
  if (can(user, 'door') && !backoffice) return 'door'
  if (backoffice) return 'tickets'
  return 'none'
}
