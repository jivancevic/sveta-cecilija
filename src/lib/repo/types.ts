// The repository seam between Cecilija and Payload (#475, ADR-0027).
//
// `Repo` is the whole contract: everything a rebuilt Cecilija screen may ask of
// the database. `src/lib/repo/payload/` is the only implementation and the only
// directory in the codebase allowed to import `payload` or `@payload-config`
// (enforced by `repo-guard.test.ts`), so phase B — replacing Payload's auth and
// local API — is "reimplement `repo/payload/`", not "audit seventy call sites".
//
// **It grows one screen at a time, never as a sweep.** The research document
// (section 6.2) names eleven repos; this file declares the ones the built
// screens actually call — `auth` and `db` from Skener, `orders` and `shows`
// grown by Narudžbe and Izvedbe, `partners` by Prodaja, `roster` by Izvedbe,
// `inquiries` by Upiti, `comp` and `members` by Gratis.
// A screen ticket adds its own, with the methods that screen actually calls, so
// no member of this interface is ever speculative.
//
// Two rules hold inside the seam:
//
//   1. **Writes go through Payload's local API** in phase A, so the collection
//      hooks keep running (the cascade deletes, the `Shows` / `Members`
//      `beforeValidate`, the roster push). Field-level access does NOT run
//      under `overrideAccess: true`, so a form that must refuse a field refuses
//      it in its route — the seam never pretends to.
//   2. **The atomic SQL stays verbatim** in the module that owns it
//      (`scan-deps.ts`, `ticket-void.ts`, `sell-lock.ts`, `sold-seats.ts`, the
//      raw-table stores). They take `db.query` / `db.execute` / `db.connect`
//      instead of reaching into `payload.db`; the statements do not move.

import type { AuthRepo, SessionUser, WriteCtx } from './auth'
import type { CompOrderRow, CompRepo, CompTicketRow } from './comp'
import type { DbRepo } from './db'
import type { InquiriesRepo, InquiryListQuery, InquiryListResult, InquiryRow } from './inquiries'
import type { MemberOption, MembersRepo } from './members'
import type { OrdersRepo } from './orders'
import type { RosterRepo, RosterViewer } from './roster'
import type { PartnerRecord, PartnersRepo } from './partners'
import type { PerformancePatch, PerformanceRow, ShowsRepo } from './shows'

export interface Repo {
  auth: AuthRepo
  comp: CompRepo
  db: DbRepo
  inquiries: InquiriesRepo
  members: MembersRepo
  orders: OrdersRepo
  roster: RosterRepo
  partners: PartnersRepo
  shows: ShowsRepo
}

export type {
  AuthRepo,
  CompOrderRow,
  CompRepo,
  CompTicketRow,
  DbRepo,
  InquiriesRepo,
  InquiryListQuery,
  InquiryListResult,
  InquiryRow,
  MemberOption,
  MembersRepo,
  OrdersRepo,
  PartnerRecord,
  PartnersRepo,
  PerformancePatch,
  PerformanceRow,
  RosterRepo,
  RosterViewer,
  SessionUser,
  ShowsRepo,
  WriteCtx,
}
