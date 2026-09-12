// Who may see and change which part of a Member (#420, ADR-0023 × ADR-0024).
//
// Two audiences meet on one table, exactly as they do on Shows (#408):
//   - `tickets` — the ticketing backoffice. A Member is a comp-attribution and
//     promo-code name (ADR-0019): `name`, `active`, `note` are theirs, and so is
//     deleting a row.
//   - `moreska` — the voditelj. A Member is a dancer: the six moreškant fields
//     (`isMoreskant`, `nickname`, `mobile`, `email`, `roles`, `primaryRole`) are
//     theirs alone, on every row, and invisible to the backoffice.
// Nobody else reaches the collection at all.
//
// Every predicate is a pure function of the user, so the rules are unit-tested
// directly (`src/collections/access.test.ts`); `src/collections/Members.ts` is
// only the wiring.

import { can, hasAny, type PermissionUser } from './permissions'

/** `tickets` or `moreska`: the two permissions that own a Member row. */
function isMemberHolder(user: PermissionUser): boolean {
  return hasAny(user, ['tickets', 'moreska'])
}

/**
 * Read: the backoffice and the voditelj both see every Member. Which FIELDS
 * they see is the field-level rule below — a `moreska`-only holder gets the
 * roster half, a `tickets`-only holder the attribution half.
 */
export function membersReadAccess(user: PermissionUser): boolean {
  return isMemberHolder(user)
}

/**
 * Create: both. A voditelj adds a dancer who is not yet in the table; `name` is
 * required, so create on `name` stays open — but `active` and `note` do not
 * (see {@link canEditAttributionField}).
 */
export function membersCreateAccess(user: PermissionUser): boolean {
  return isMemberHolder(user)
}

/** Update: both, narrowed field by field. */
export function membersUpdateAccess(user: PermissionUser): boolean {
  return isMemberHolder(user)
}

/**
 * Delete: `tickets` only. A Member row carries comp history and promo codes; a
 * voditelj retires a dancer with `active`, never by removing the row.
 */
export function membersDeleteAccess(user: PermissionUser): boolean {
  return can(user, 'tickets')
}

/**
 * The sidebar entry. The voditelj needs Members as the roster's entry point
 * (#419, voditelj story 2), the backoffice as the comp-attribution list.
 */
export function membersHiddenInAdmin(user: PermissionUser): boolean {
  return !isMemberHolder(user)
}

/**
 * The six moreškant fields: read AND write for `moreska`, invisible to everyone
 * else — a ticket admin's Member form stays about comp attribution (#419,
 * story 39). Read is locked too, so the roster half never leaves the server in
 * a `tickets`-only API response.
 */
export function canReadMoreskantField(user: PermissionUser): boolean {
  return can(user, 'moreska')
}

/** @see canReadMoreskantField — same rule for writes, on create and on update. */
export function canEditMoreskantField(user: PermissionUser): boolean {
  return can(user, 'moreska')
}

/**
 * `name`, `active` and `note` — the ADR-0019 attribution half. Readable by both
 * (the voditelj needs the real name behind a nickname), writable by the
 * backoffice only: renaming or retiring a Member reaches comp reporting and
 * the promo-code picker, which are not the voditelj's to move.
 *
 * It gates create as well as update on `active` and `note`, so a `moreska`-only
 * holder cannot reach through a new row what they may not change on an existing
 * one. `name` is the exception, left open on create: a voditelj adds a dancer
 * and the field is required, so locking it would make create impossible for
 * them. Payload falls back to a field's `defaultValue` when access strips the
 * incoming value, so a voditelj's new member is still `active = true`.
 */
export function canEditAttributionField(user: PermissionUser): boolean {
  return can(user, 'tickets')
}
