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
   * Every ACTIVE partner, by name (#509). Financije bills each one at its own
   * rate, so the receivable panel needs the whole channel rather than one row;
   * a deactivated partner is left out because it can no longer sell, and a
   * statement for it is a thing to look up in the Backoffice, not a line on a
   * screen that is about this month's money. Korisnici reads the same list for
   * its "Poveži partnera" picker (#510), and for the same reason: a retired
   * reseller must not be offered a new login, while the ones already pointed at
   * it keep working until somebody unlinks them.
   */
  activeList(): Promise<PartnerRecord[]>

  /**
   * EVERY partner, active or not, by name (#599). Obračun's partner picker
   * reads this rather than `activeList`, and the difference is a real debt: a
   * reseller deactivated in September still owes for what it sold in August,
   * and a statement the secretary cannot open is a receivable nobody chases.
   * Prodaja keeps `activeList`, because a retired partner must not be offered
   * a new sale.
   */
  all(): Promise<PartnerRecord[]>
}

export type { PartnerRecord }
