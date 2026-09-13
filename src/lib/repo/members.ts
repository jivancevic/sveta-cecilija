// MembersRepo — the attribution list, and the one row Gratis may add to it
// (#506, #475).
//
// Two methods, because the comp form asks exactly two things of the Members
// collection: who may a comp be attributed to, and "this person is not on the
// list yet, put them on it". Everything else about a Member — the moreškant
// half, the nickname, the dance roles, the invitation — belongs to Članovi
// (#511) and to the Backoffice, and none of it is here.
//
// The create is deliberately name-only. `tickets` may create a Member (the
// collections table), and the field locks say a `tickets` holder may not write
// the moreškant fields; passing a name and nothing else means the seam cannot
// carry a field the caller is not allowed to set. Field-level access does NOT
// run under `overrideAccess: true`, so that is a real guarantee rather than a
// hope: the shape of this method is the refusal.

import type { MemberOption } from '@/lib/app/comp-screen'
import type { WriteCtx } from './auth'

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
}

export type { MemberOption }
