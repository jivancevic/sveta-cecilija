// Which of the six named actions this reader may press, and why not (#567, Q53).
//
// Izvedbe is unlocked by `tickets` AND by `moreska`, and since #567 both halves
// may enter and correct any evening. What they may not share is the money and
// the buyers: cancelling refunds every online order, moving a date or a house
// mails every ticket holder, the door ledger is the till's own record and
// pausing stops a sale. So the gate is per ACTION rather than per row, and this
// is the whole of it.
//
// Three rules, and each of them is a decision rather than a shape:
//
//   1. **A refused action is greyed, never hidden.** A voditelj reading Izvedbe
//      has to be able to see that "Otkaži izvedbu" exists and that it is the
//      Blagajna's; a control that vanishes with the permission teaches nobody
//      who to ask. The caption is the `reason`, in Croatian, naming the person.
//   2. **The caption is not the refusal.** Every one of these routes re-checks
//      the permission in its own handler (CLAUDE.md's hard rule), so a disabled
//      button is a courtesy and the 403 is the rule. This module is what keeps
//      the two saying the same thing, because the page renders from it and
//      never re-types a `can()` in JSX.
//   3. **Otkaži needs both words.** It is the blagajna's action (`tickets`) and
//      it moves money (`refunds`), so a `refunds` holder who is not the
//      blagajna is refused it as surely as a voditelj is — and the route says
//      the same, in the handler, since #567.
//
// Pure: a permission set in, six answers out. No IO, no clock, no row. Which
// actions are OFFERED at all is still the page's business (a booking sells
// nothing, so it gets none of them; a cancelled evening keeps only the ledger),
// because that is a fact about the evening rather than about the reader.

import { can, hasAny, type Permission } from '@/lib/access/permissions'
import { APP_STRINGS } from './strings'

const S = APP_STRINGS.showActions

/**
 * The six named actions of one public evening, in the order they stand on the
 * screen: the reversible ones first, the link, and the one that cannot be
 * undone last.
 */
export type PerformanceActionKey =
  | 'pause'
  | 'reschedule'
  | 'move'
  | 'door'
  | 'orders'
  | 'cancel'

export const PERFORMANCE_ACTIONS: PerformanceActionKey[] = [
  'pause',
  'reschedule',
  'move',
  'door',
  'orders',
  'cancel',
]

export interface PerformanceActionGate {
  action: PerformanceActionKey
  enabled: boolean
  /** The caption under a greyed button; null when the button works. */
  reason: string | null
}

export type PerformanceActionGates = Record<PerformanceActionKey, PerformanceActionGate>

/** Every action but Otkaži: the blagajna's desk, one permission. */
function boxGate(action: PerformanceActionKey, held: readonly Permission[]): PerformanceActionGate {
  const ok = can({ permissions: [...held] }, 'tickets')
  return { action, enabled: ok, reason: ok ? null : S.needsBox }
}

/**
 * Otkaži: the blagajna's action AND a refund run, so it asks for both words.
 *
 * The two refusals are deliberately different sentences. Somebody without
 * `tickets` is on the wrong desk and is pointed at the Blagajna; somebody with
 * `tickets` and no `refunds` is at the right desk without the key to the money,
 * which is a thing a `users` holder can grant them. Naming only one of those
 * would send half the readers to the wrong person.
 */
function cancelGate(held: readonly Permission[]): PerformanceActionGate {
  const user = { permissions: [...held] }
  if (!can(user, 'tickets')) return { action: 'cancel', enabled: false, reason: S.needsBox }
  if (!can(user, 'refunds')) {
    return { action: 'cancel', enabled: false, reason: S.needsRefundsCaption }
  }
  return { action: 'cancel', enabled: true, reason: null }
}

/** What this permission set may do to one public evening. */
export function performanceActionGates(held: readonly Permission[]): PerformanceActionGates {
  return {
    pause: boxGate('pause', held),
    reschedule: boxGate('reschedule', held),
    move: boxGate('move', held),
    door: boxGate('door', held),
    orders: boxGate('orders', held),
    cancel: cancelGate(held),
  }
}

/**
 * Whether this reader may enter and correct an izvedba at all (#567, Q53).
 *
 * Both halves of the screen may create and edit both kinds of row since #567:
 * a voditelj enters the public evenings of a season as readily as the secretary
 * enters a cruise call, and the two shapes of the form differ by what an
 * evening IS rather than by who is typing. The money actions above are where
 * the two halves still part.
 *
 * It is the same predicate the two shared routes apply in their handlers, so a
 * form that is offered is a form the server accepts.
 */
export function mayWritePerformance(held: readonly Permission[]): boolean {
  return hasAny({ permissions: [...held] }, ['tickets', 'moreska'])
}

/**
 * Otkaži on a BOOKING, which is a different action with the same name.
 *
 * `POST /api/app/performances/[id]/cancel` flips a status and mails nobody,
 * because a booking sells no ticket; it stays the voditelj's, exactly as it was
 * before #567 widened the two write routes. The public evening's Otkaži is
 * `/api/shows/[id]/cancel` and is gated by `cancelGate` above.
 */
export function mayCancelBooking(held: readonly Permission[]): boolean {
  return can({ permissions: [...held] }, 'moreska')
}
