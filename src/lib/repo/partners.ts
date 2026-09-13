// PartnersRepo — the one read Prodaja and Obračun make of the Partners
// collection (#505, #475).
//
// One method, because a partner screen asks exactly one question of that
// collection: who is this login, is it still live, and what cut does it keep.
// Partners CRUD stays in the Backoffice (ADR-0027, #476), so there is no write
// here and there should not be one: a reseller must never be able to edit its
// own commission.
//
// The projection is the domain row the pure `partner-screen.ts` reads, never a
// Payload document, so phase B rewrites `repo/payload/partners.ts` and nothing
// above it.

import type { PartnerRecord } from '@/lib/app/partner-screen'

export interface PartnersRepo {
  /**
   * The Partners row behind a `partner` login, or null when the link is
   * missing or dangling. Null is a refusal the screen prints, never a crash:
   * ownership is fail-safe (`src/lib/access/partner.ts`).
   */
  byId(id: string | number): Promise<PartnerRecord | null>

  /**
   * Every live partner, by name, for the "Poveži partnera" picker on Korisnici
   * (#510).
   *
   * Active only: a retired reseller must not be offered a new login, and the
   * ones already pointed at it keep working until somebody unlinks them. Still
   * no write here — a reseller may never edit its own commission, so Partners
   * CRUD stays in the Backoffice (ADR-0027, #476).
   */
  listActive(): Promise<PartnerRecord[]>
}

export type { PartnerRecord }
