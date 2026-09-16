// MembersRepo — the Members collection, from both sides (#506, #511, #475).
//
// A Member row has two halves and two audiences (`members-access.ts`), and this
// interface has grown one method set per half:
//
//   - the **attribution** half, ADR-0019's comp-and-promo name, which Gratis
//     asks two things of (#506): who may a comp be attributed to, and "this
//     person is not on the list yet, put them on it";
//   - the **roster** half, ADR-0024's dancer, which Članovi is the first screen
//     whose whole subject is (#511): who is on the roster, does a login point at
//     them, change one, add one. The invitation list, the self-link list and the
//     rehearsal join code each used to ask the first two with their own
//     `payload.find`; they now ask here.
//
// What comes back is a screen's own shape — `MemberOption`, `MemberRosterRow` —
// never a Payload document, so phase B is a rewrite of
// `repo/payload/members.ts` and nothing above it. The attribution half's `note`
// is deliberately absent from the roster shape: it is the Backoffice's and
// Cecilija never shows it.
//
// **Writes go through the local API** so the `beforeValidate` hook runs: it is
// the only writer that can see the other rows, so it is the only place nickname
// uniqueness can be decided. Field-level access does NOT run under
// `overrideAccess: true`, so WHICH fields a caller may send is decided above the
// seam, in the route, where it is testable. `create` carries that rule in its
// SHAPE — a name and nothing else, because `tickets` may not write the
// moreškant fields — and `createMoreskant` is the voditelj's counterpart.

import type { MemberOption } from '@/lib/app/comp-screen'
import type { MemberAccountSignal } from '@/lib/app/member-marks'
import type { MemberRosterRow } from '@/lib/app/members-screen'
import type { WriteCtx } from './auth'

/** A dancer as Članovi writes one: the moreškant half plus a name. */
export interface NewMoreskant {
  name: string
  nickname?: string
  mobile?: string | null
  email?: string | null
  roles?: string[]
  primaryRole?: string
  isMoreskant: true
}

export interface MembersRepo {
  /**
   * Every active member, by name, for the comp form's picker.
   *
   * Active only: a retired member drops out of the picker without taking the
   * history of what they already received with them (ADR-0019).
   */
  listActive(): Promise<MemberOption[]>

  /**
   * Add a member from the comp form's "Dodaj člana", with a name and nothing
   * else. Goes through the collection so the Members hooks run, and carries
   * the `WriteCtx` so Payload attributes the row to whoever typed it.
   */
  create(name: string, ctx: WriteCtx): Promise<MemberOption>

  /**
   * Every moreškant row, active and retired alike.
   *
   * Retired ones ride along because Članovi lists them under the active ones
   * rather than hiding them (`members-screen.ts`): a dancer retired by accident
   * has to be findable. The society is tens of rows, so this is one page.
   */
  listMoreskanti(): Promise<MemberRosterRow[]>

  /** One Member by id, or null when the id is not one. */
  byId(id: string): Promise<MemberRosterRow | null>

  /**
   * The ids of Members some login points at.
   *
   * The "Ima prijavu" question (#424), asked once for a whole list rather than
   * once per row. It answers whether an account exists and never what is in it.
   */
  idsWithLogin(): Promise<Set<string>>

  /**
   * What the roster knows about each dancer's ACCOUNT, by Member id (#653).
   *
   * The sharper half of `idsWithLogin`: not "does a login exist" but "has
   * anybody ever been inside, is the app on their phone, does it ring, and do
   * they hold a key of their own". A Member absent from the map has no login at
   * all, which the screen reads as the same "nije ušao".
   *
   * One call for the whole list rather than one per row, for the same reason
   * `idsWithLogin` is: seventy-six rows must not cost seventy-six queries.
   */
  accountSignals(): Promise<Map<string, MemberAccountSignal>>

  /**
   * Patch one Member through the collection, so the hook runs.
   *
   * Rejects with {@link MemberHookError} when the hook refuses; the caller
   * (`handleMemberPatch`) turns that into a 400 the voditelj can read.
   */
  update(id: string, patch: Record<string, unknown>, ctx: WriteCtx): Promise<MemberRosterRow>

  /** Add a dancer by hand, `isMoreskant` included. Same hook, same refusals. */
  createMoreskant(input: NewMoreskant, ctx: WriteCtx): Promise<MemberRosterRow>
}

/**
 * The Members `beforeValidate` hook said no, in Croatian.
 *
 * A named error rather than a string comparison at the call site: the data
 * layer catches this one and hands its message to `handleMemberPatch`, which
 * turns it into a 400 a voditelj can read. Anything else stays a 500, because
 * a dead connection has no sentence anybody can act on.
 */
export class MemberHookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberHookError'
  }
}

export type { MemberOption, MemberRosterRow }
