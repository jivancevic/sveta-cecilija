// MembersRepo — the roster half of the Members collection (#511, #475).
//
// Članovi is the first screen whose whole subject is a Member, so this is where
// the four questions that used to be asked in five different `*-data.ts`
// modules land: who is on the roster, does a login point at them, change one,
// add one. The invitation list, the self-link list and the rehearsal join code
// all asked the first two with their own `payload.find`; they now ask here.
//
// What comes back is `MemberRosterRow`, the screen's own shape, never a Payload
// document — so phase B is a rewrite of `repo/payload/members.ts` and nothing
// above it. The attribution half of a Member (`note`) is deliberately absent
// from that shape: it is the Backoffice's (ADR-0019) and Cecilija never shows
// it.
//
// **Writes go through the local API** so the `beforeValidate` hook runs: it is
// the only writer that can see the other rows, so it is the only place nickname
// uniqueness can be decided. Field-level access does NOT run under
// `overrideAccess: true`, so WHICH fields a voditelj may send is decided in
// `src/lib/app/members-edit.ts`, in the route, where it is testable.

import type { MemberRosterRow } from '@/lib/app/members-screen'
import type { WriteCtx } from './auth'

/** A dancer as this screen writes one: the moreškant half plus a name. */
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
   * Every moreškant row, active and retired alike.
   *
   * Retired ones ride along because the screen lists them under the active ones
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
   * Patch one Member through the collection, so the hook runs.
   *
   * Rejects with the hook's own Croatian message when it refuses; the caller
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

export type { MemberRosterRow }
