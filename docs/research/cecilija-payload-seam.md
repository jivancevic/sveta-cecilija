# Cecilija: what the app needs from Payload, and the repository seam for phase B

> Research for issue #475 (Cecilija map #471). Sources are this repository only,
> read at commit `2d5dffe` (main, 2026-09-12): `src/payload.config.ts`,
> `src/collections/*.ts`, `src/lib/**`, `src/app/api/**`, `src/app/app/**`,
> `src/app/(payload)/**`, `src/components/payload/**`, `db/schema/*.sql`,
> `docs/agents/payload-admin.md`, `docs/agents/permissions.md`,
> `docs/adr/0023-permissions-replace-roles-app-surface.md`. Line numbers are
> from that commit. No external sources.

## Summary

- Payload is used for four things: **auth** (session cookie, password hashing,
  reset tokens, sessions), **the local API** (`payload.find/findByID/create/
  update/delete`) on 13 collections, **the Postgres pool and drizzle handle** it
  holds open (`payload.db.pool`, `payload.db.drizzle`, transactions), and **the
  stock `/admin` CRUD** for collections nobody wrote a form for.
- 40 non-test files import `getPayload` (grep, `src/`), and 31 route files reach
  it through `requirePermission` (`src/lib/access/route-guard.ts:35`). Another
  dozen `*-data.ts` / `*-deps.ts` modules take a `payload` slice as a parameter.
- The codebase already has a consistent shape: a **pure module** with the rules
  and a **`*-data.ts` / `*-deps.ts` module** holding "the Payload calls and
  nothing else", each declaring the slice of `getPayload()` it uses as a local
  interface (`LineupStorePayload`, `McpPayload`, `CompIssuePayload`,
  `BulkCreatePayload`, `ShowsFind`, `PoolQuery`). The seam proposed in section 6
  names that shape, moves it to one directory, and adds the rule that keeps new
  code from bypassing it.
- Six collection hooks and about 30 field-level access rules run **only** when a
  write goes through Payload's local API or REST. A custom Cecilija form that
  writes through the local API keeps the hooks (they run with `overrideAccess`)
  but **loses every field-level access rule**; a form that writes raw SQL loses
  both. Section 3 lists what has to be re-hosted.
- Eight raw tables already bypass Payload entirely, all through the one-method
  `PoolQuery` view (`src/lib/db/pool-query.ts:11`). That is the pattern phase B
  extends to the rest.

---

## 1. Inventory: every `getPayload` / `payload.auth` call site, by v1 screen

Legend for the "what it uses" column: **auth** = `payload.auth`, **login ops** =
`payload.login/forgotPassword/resetPassword` + `logoutOperation`, **local API** =
`find/findByID/create/update/delete`, **pool** = `payload.db.pool.query` raw SQL,
**drizzle** = `payload.db.drizzle.execute` raw SQL, **tx** =
`payload.db.beginTransaction/commitTransaction/rollbackTransaction`.

Every route marked `guard` goes through `requirePermission(req, …)`
(`src/lib/access/route-guard.ts:35-51`), which is itself `getPayload` +
`payload.auth` + `can()/hasAny()` and hands the `payload` instance back.

### 1.1 Scan station and door list

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/scan/[token]/page.tsx:433-435` | none (auth-aware page) | auth, then `buildScanDeps()` | Buyer view if unauthenticated; staff atomic mark if `door`/`tickets`. Subject to Payload's CSRF/Origin gate (section 2.6). |
| `src/lib/scan-deps.ts:14-107` | n/a (builder) | drizzle (`UPDATE tickets … WHERE scanned=false RETURNING`), local API `findByID` on orders and shows | Shared by the page and `POST /api/scan/[token]`. |
| `src/app/api/scan/[token]/route.ts:10` | `['door','tickets']` | via `buildScanDeps` | |
| `src/app/api/scan/[token]/undo/route.ts:11,24` | `['door','tickets']` | drizzle | |
| `src/app/api/scan/[token]/admit-party/route.ts:22,34,49` | `['door','tickets']` | drizzle | |
| `src/app/api/scan/[token]/claim/route.ts:55-116` | none (token) | drizzle + local API `findByID` shows | Buyer claims their e-mail from a scanned slip; rate-limited. |
| `src/app/api/orders/lookup/route.ts:35,66,80,95` | `['door','tickets']` | local API `find` orders, `find` tickets, `create` order-lookups | The audit row (`order-lookups`) is written here, not by a hook. Uses `getNextShow()`. |
| `src/components/payload/AdminScanView.tsx:15-16` | inline `hasAny` | auth | `/admin/scan`; the client (`ScanStationClient.tsx`) calls the three scan routes above. |

### 1.2 Orders (refund, resend, PDF)

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/api/orders/[id]/refund/route.ts:10` | `refunds` | via `buildRefundOrderDeps` | |
| `src/lib/refund/build-refund-order-deps.ts:16-50` | n/a | local API `findByID` orders (depth 1), `update` orders; drizzle via `voidOrderTickets` | Shared with buyer self-serve refund. |
| `src/app/api/order/[token]/refund/route.ts:40` | none (token) | pool via `loadRefundContext` (`src/lib/refund/reschedule-refund-context.ts:57-70`), then the same deps | ADR-0021. |
| `src/app/order/[token]/refund/page.tsx:217` | none (token) | pool via `loadRefundContext` | Buyer-facing page. |
| `src/app/api/orders/[id]/resend-ticket-email/route.ts:19` | `tickets` | local API (order + tickets + show read for the mail) | |
| `src/app/api/orders/[id]/tickets.pdf/route.ts:15,39,70` | inline `payload.auth` + `hasAny` + `partnerIdOf`, or a signed ticket link | auth, local API `find` | Not on `requirePermission` because the same route also serves a signed buyer link (`verifyTicketLink`). |
| `src/lib/dispute/build-dispute-deps.ts:20-45` | n/a | local API `find`/`update` orders; drizzle void; pool for the `critical_events` claim | Fed by the Stripe webhook. |
| `src/components/payload/RefundOrderMenuItem.tsx`, `ResendTicketEmailMenuItem.tsx` | client | `fetch('/api/orders/${id}/refund')`, `…/resend-ticket-email` | Edit-menu items on the Orders edit view (`src/collections/Orders.ts:70-73`). |

Stock Payload views also in use for this screen: the Orders list and edit view
(`src/collections/Orders.ts:54-67`, `listSearchableFields: ['buyerName','email']`)
and the Tickets list (`src/collections/Tickets.ts:29-32`).

### 1.3 Performances (edit, reschedule, cancel, venue move, offline sales, bulk create)

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/api/shows/[id]/reschedule/route.ts:148,169` | `tickets` | pool (raw `UPDATE shows`), local API reads for the buyer mails, push via `notifyRawPerformanceSave` | Raw write, so the Shows hooks do not fire; the route calls `src/lib/push/raw-save.ts` by hand to replace the `afterChange` push. |
| `src/app/api/shows/[id]/move-to-zimsko/route.ts:94,110` | `tickets` | pool (raw `UPDATE shows`), local API reads, push via `notifyRawPerformanceSave` | Same raw-write pattern. |
| `src/app/api/shows/[id]/offline-sales/route.ts:26,103` | `tickets` | pool + a pool transaction (`OfflineSaleTxPool`) via `src/lib/offline-sales/data.ts` | Ledger insert and `shows.in_person_sold/legacy_reserved` cache update in one transaction (ADR-0025). |
| `src/app/api/shows/bulk-create/route.ts:12,56` | `tickets` | local API `find` (duplicate check on `PUBLIC_PERFORMANCE_WHERE`), then `payloadBulkDeps` | |
| `src/lib/performance-bulk-create.ts:92-130` | n/a | tx + local API `create` shows with `overrideAccess: true` | Shared with the MCP `create_performances` tool. |
| `src/components/payload/CancelShowMenuItem.tsx:26-30` | client | **Payload REST** `PATCH /api/shows/${id}` `{ status: 'cancelled' }` | One of only two places that write through Payload's REST (`src/app/(payload)/api/[...slug]/route.ts`). Collection access and field access apply here (section 3). |
| `src/components/payload/{RescheduleShow,MarkMovedToZimsko,InPersonSales,ViewOrdersForShow}MenuItem.tsx` | client | `fetch` to the three routes above | Edit-menu items registered at `src/collections/Shows.ts:125-131`. |
| `src/components/payload/BulkCreateShowsView.tsx:11-12` | inline (signed-in only) | auth | `/admin/bulk-create-shows`; the form posts to `/api/shows/bulk-create`. |
| `src/lib/shows.ts:30,47,53` | none (public) | local API `find` via `ShowsFind`, pool via `sold-seats.ts` | `getUpcomingShows()` / `getNextShow()`, the CLAUDE.md-mandated entry point. Used by the door lookup and the comp panel too. |

Stock Payload views also in use: the Shows list/edit view with 12 default
columns and six field `condition`s (`src/collections/Shows.ts:106-138,
189-473`). Field-level locks on this collection are the densest in the repo
(section 3.2).

### 1.4 Partner sales (sell, storno, statement)

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/api/partner/sell/route.ts:24,63-125` | `partner` | local API `findByID` shows, `find` orders (code uniqueness), `create` orders, `create` tickets; pool for `getActiveTicketCountForShow` and `withShowSellLock` | Order + tickets written through the local API, one `create` per ticket. |
| `src/app/api/partner/storno/route.ts:19` | `['tickets','partner']` | drizzle via `voidOrderTickets/voidSingleTicket`; ownership via `actsAsPartner`/`partnerIdOf` | |
| `src/app/api/partner/storno/undo/route.ts:35` | `['tickets','partner']` | drizzle (`reactivate`), pool (`getActiveTicketCountForShow`, `withShowSellLock`) | |
| `src/app/api/partner/sales/route.ts:19` | `partner` | pool via `src/lib/partner/recent-sales-page.ts` | |
| `src/app/api/partner/reconciliation/route.ts:19` | `['tickets','partner']` | pool via `src/lib/partner/partner-data.ts` | Raw SQL scoped by `partner_id` in every query (`partner-data.ts:1-4`). |
| `src/components/payload/AdminDashboardView.tsx:509-530` (`PartnerDashboard`) | inline | auth, local API `findByID` partners | Renders `PartnerSellForm`, `PartnerRecentSales`, `PartnerMonthToDateCard`, `StatementDownload`, which call the four routes above. |

Stock Payload views: the Partners list/edit view (`src/collections/Partners.ts:27-33`),
including the reverse `join` field listing linked logins (`Partners.ts:64-70`).

### 1.5 Comp tickets and promo codes

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/api/comp/issue/route.ts:15` | `tickets` | via `buildCompIssueDeps` | |
| `src/lib/comp/comp-issue-deps.ts:56-140` | n/a | local API `findByID` shows, `find` orders (code), `create` orders, `create` tickets; pool for the count and the sell lock | The one comp writer, shared with `/app` (`src/lib/app/comp-data.ts:1-11`). |
| `src/app/api/comp/cancel/route.ts:23,39-58` | `tickets` | local API `findByID` orders/tickets; drizzle void | |
| `src/app/api/comp/members/route.ts:12,16,28,43` | `tickets` | local API `find` members (active), `create` members | The "add a member inline from the comp form" path. |
| `src/app/api/app/comp/issue/route.ts:30`, `src/app/api/app/comp/cancel/route.ts:29` | `moreskant` | via `src/lib/app/comp-data.ts` (local API `findByID` users/members/orders, `find` tickets; the same `buildCompIssueDeps`) | Self-issued comps, cap of 4 (`src/lib/comp/self-comp.ts:28`). |
| `src/components/payload/CompIssuePanel.tsx`, `CompIssueForm.tsx` | client | `fetch('/api/comp/issue')`, `fetch('/api/comp/members')` | Mounted on the tickets dashboard (`AdminDashboardView.tsx:180-200`). |
| `src/app/actions/checkout.ts:51-67` | none (public server action) | local API `find` promo-codes (`overrideAccess: true`, line 33), `findByID` shows | Promo code applied at online checkout (ADR-0018). |

Stock Payload views: the PromoCodes list/edit view is the **only** UI for
creating a promo code (`src/collections/PromoCodes.ts:28-33`, `useAsTitle:
'code'`, a required `member` relationship picker). The Members list/edit view
doubles as the attribution list for `tickets` holders (`src/collections/Members.ts:137-155`).

### 1.6 Moreškant section (moves as-is)

`/app` resolves the viewer once per request in `src/lib/app/viewer.ts:60-96`
(auth + `findByID` users + `findByID` members, both `overrideAccess: true`), then
each page calls one `*-data.ts` module. All of them run the local API with
`overrideAccess: true` by decision (`docs/agents/moreskant-app.md:77`).

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/lib/app/viewer.ts:61-62,69,78` | n/a | auth, local API `findByID` users, members | Feeds `decideAppAccess()` (`src/lib/app/access.ts:57`). Used by every `/app` page. |
| `src/lib/app/roster-data.ts:18-27` | n/a | local API `find` shows | `/app`, `/app/dobrodosli`. |
| `src/lib/app/detail-data.ts:23-120` | n/a | local API `findByID` shows, `find` attendance/lineups/members/orders; pool via `loadSeatsRemaining` | `/app/izvedba/[id]`. |
| `src/lib/app/my-season-data.ts:20-58` | n/a | local API `find` shows, lineups | `/app/moje`. |
| `src/lib/app/stats-data.ts:17-63` | n/a | local API `find` shows, lineups, members | `/app/statistika`, `/app/moje` leaderboard. |
| `src/lib/app/link-self-data.ts:18-30` | n/a | local API `find` members + `loadMemberIdsWithLogin` | `/app/povezi`. |
| `src/app/api/app/attendance/route.ts:40,62-150` | `['moreskant','moreska']` | local API `findByID` shows/members, `find`/`create`/`update`/`delete` attendance; push via `createPushDeps` | The only attendance writer. `resolveOwnMemberId` re-reads `Users.member`. |
| `src/app/api/app/lineup/route.ts:27,42,57` + `src/lib/lineup/lineup-store.ts:12-147` | `moreska` | tx, drizzle on the transaction's session (`SELECT … FOR UPDATE`), local API `create`/`delete` lineups and `update` shows inside the same `transactionID` | Detailed in `lineup-store.ts:8-23`: the lock must run on `payload.db.sessions[tx].db`, not on the pool. |
| `src/app/api/app/lineup/confirm/route.ts:36` | `moreska` | same store | |
| `src/app/api/app/note/route.ts:23,34,48,56` | `moreska` | local API `findByID`/`update` shows | Writes `voditeljNote`, which fires the Shows `afterChange` push hook. |
| `src/app/api/app/link-self/route.ts:26,57-98` | `moreska` | local API `findByID` users, `find` members, `update` users (`member` link) | |
| `src/app/api/app/invite/route.ts:24`, `invite/all/route.ts:31,45` + `src/lib/app/invite-data.ts:23-80` | `moreska` | local API `findByID` members, `find` users, `create` users (`permissions: ['moreskant']`, `member` link), `update`; `forgotPassword` via `account-data.ts:36` | The only way a dancer login is created. |
| `src/app/api/app/alarm/route.ts:24` + `src/lib/push/push-data.ts:80-111` | `moreska` | local API `findByID` shows, `find` attendance/members; pool via `src/lib/push/store.ts` | |
| `src/app/api/app/push/{subscribe,unsubscribe}/route.ts:22,18` | `['moreskant','moreska']` | pool via `push/store.ts` | Raw tables only. |
| `src/app/api/app/onboarding/done/route.ts:43` | `['moreskant','moreska']` | auth only | Sets the onboarding cookie. |
| `src/app/api/app/calendar/[token]/route.ts:28-30` + `src/lib/calendar/calendar-data.ts:23-30` | none (`CALENDAR_FEED_TOKEN`) | local API `find` shows | |
| `src/app/api/app/authorize/route.ts:28-29` | inline `can(user,'moreska')` | auth; pool via `oauthStoreFor` | MCP consent; documented exception to `requirePermission` in CLAUDE.md. |
| `src/app/api/mcp/[transport]/route.ts:80-82,207,224-231` + `src/lib/mcp/store.ts:42-47` | bearer → `verifyToken` re-reads the user with `findByID … overrideAccess: true` and asks `can(user,'moreska')` | local API `find`/`findByID`/`create`; `payloadBulkDeps`; `createLineupStore` | The tool list is the narrowing, not collection access (`docs/agents/permissions.md:47`). |
| `src/app/api/oauth/token/route.ts:66` | none (OAuth) | pool via `oauthStoreFor` | |
| `src/app/api/cron/moreskant-notifications/route.ts:33` | `CRON_SECRET` bearer | via `createPushDeps` + `loadDuePerformances` (pool sweep, `push-data.ts:9-13`) | |
| `src/components/payload/InviteMoreskantMenuItem.tsx`, `InviteAllMoreskantiMenuItem.tsx` | client | `fetch('/api/app/invite')`, `…/invite/all` | Registered on Members (`src/collections/Members.ts:146-154`). |

Stock Payload views: Members (voditelj half), Attendance and Lineups list/edit
views are the "fix a wrong row without the developer" surface
(`src/collections/Attendance.ts:19-20`, `src/collections/Lineups.ts:24-26`).

### 1.7 Users and permissions

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/api/app/login/route.ts:27-48` | own CSRF guard | `payload.login` + `generatePayloadCookie` | Section 2.1. |
| `src/app/api/app/logout/route.ts:22-40` | own CSRF guard | auth, `logoutOperation` + `createLocalReq`, `generateExpiredPayloadCookie` | Section 2.2. |
| `src/app/api/app/forgot/route.ts:36-65` | own CSRF guard + rate limit | local API `find` users (`overrideAccess: true`), `forgotPassword` via `issueAppResetToken` | Section 2.3. |
| `src/app/api/app/set-password/route.ts:24-40` | own CSRF guard | `payload.resetPassword` (`overrideAccess: true`) + `generatePayloadCookie` | Section 2.4. |
| `src/lib/access/route-guard.ts:39-40` | n/a | auth | The chokepoint every guarded route uses. |
| `src/lib/access/attendance-access.ts:93-102` (`resolveOwnMemberId`) | n/a | local API `findByID` users (`overrideAccess`) | Re-reads the field-locked `Users.member` for the caller. |
| `src/lib/access/member-logins.ts:32-56` | n/a | local API `find` users | Feeds the virtual `Members.hasLogin` column (`src/collections/Members.ts:316-349`). |
| `src/components/payload/AccountLogout.tsx` | client | Payload's own logout | `ui` field on Users (`src/collections/Users.ts:276-284`). |

There is **no custom user-management route**. Creating a staff account, setting
a permission set, flagging `shared`, linking a `partner`: all of it is the stock
Users edit view (`src/collections/Users.ts:146-180`, hidden unless `can(user,
'users')`), whose field-level locks are what stop self-promotion (section 3.2).
The one exception is the invitation, which creates a dancer login with a fixed
bundle (`src/lib/app/invite-data.ts:69`).

### 1.8 Season statistics

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/components/payload/AdminDashboardView.tsx:69-70,167,182,474-497,518` | inline (`dashboardBranchFor`) | auth, local API `find` contact-submissions (`new` count), `find` members; `getStatsInput()`, `getUpcomingShows()`; pool for `MemberDashboard` | Replaces the stock dashboard (`src/payload.config.ts:70-72`). Branches per permission set: partner / season_stats / door / tickets. |
| `src/lib/stats-data.ts:17-40` | n/a | local API `find` shows via `ShowsFind`; pool via `sold-seats.ts` and a revenue query | `loadStatsInput` in `stats-loaders.ts` is the pure half. |
| `src/lib/show-stats-data.ts:16-40` | n/a | local API `findByID` shows, `find` orders; pool | `/admin/stats/[showId]`. |
| `src/components/payload/AdminStatsView.tsx:32-33` | inline (signed-in; PII columns gated on `tickets`) | auth | |
| `src/components/payload/MemberSeasonDashboard.tsx` | server-rendered | n/a | The `season_stats` branch. |

### 1.9 Inquiries

| Call site | Guard | What it uses | Notes |
|---|---|---|---|
| `src/app/actions/contact.ts:18,27` | none (public form) | local API `create` contact-submissions | |
| `src/components/payload/MarkHandledMenuItem.tsx:29-33` | client | **Payload REST** `PATCH /api/contact-submissions/${id}` `{ status: 'handled' }` | The second of the two REST writers. Collection access `tickets` applies (`src/collections/ContactSubmissions.ts:9-14`). |
| `src/components/payload/InquiriesBadge.tsx` + `AdminDashboardView.tsx:167-175` | server | local API `find` (status `new`) | The badge count. |

Stock Payload views: the ContactSubmissions list/edit view is the whole inbox
(`ContactSubmissions.ts:15-24`).

### 1.10 Public site (stays as it is; out of Cecilija scope, listed for completeness)

| Call site | What it uses |
|---|---|
| `src/lib/shows.ts:30-58` | local API `find` shows + pool (seat counts) |
| `src/app/(frontend)/checkout/[showId]/page.tsx:47-50` | local API `findByID` shows |
| `src/app/(frontend)/checkout/[showId]/confirmation/page.tsx:29-34` | local API `find` orders by `pi` (retry loop) |
| `src/app/actions/checkout.ts:51-67` | local API `find` promo-codes, `findByID` shows |
| `src/app/actions/contact.ts:18-27` | local API `create` contact-submissions |
| `src/lib/posts.ts:44-85`, `src/lib/faqs.ts:54-55` | local API `find` posts / faqs (public read access on the collection) |
| `src/app/api/unsubscribe/route.ts:27` | pool (`marketing_optouts`) |

### 1.11 Webhook, cron, health

| Call site | Guard | What it uses |
|---|---|---|
| `src/app/api/stripe/webhook/route.ts:60-64,90-174` | Stripe signature | local API `find` orders (idempotency by `stripePaymentIntentId`), `create` orders, `create` tickets, `find` promo-codes, `findByID` shows; pool for `withShowSellLock`; `buildDisputeDeps` |
| `src/app/api/cron/send-review-emails/route.ts:38` | `CRON_SECRET` bearer | pool (JOIN orders/shows, `marketing_optouts`), local API `update` orders (`reviewEmailSentAt`) |
| `src/app/api/cron/moreskant-notifications/route.ts:33` | `CRON_SECRET` bearer | see 1.6 |
| `src/app/api/health/route.ts:22` | none | `poolQuery(payload)` for `dbOk` |

### 1.12 Modules that already take a Payload slice as a parameter

These are the existing seam candidates. Each declares the subset of
`getPayload()` it needs as a local interface rather than importing `Payload`:

| Module | Declared slice | Lines |
|---|---|---|
| `src/lib/lineup/lineup-store.ts` | `LineupStorePayload` (`db.beginTransaction/commit/rollback`, `db.sessions`, `db.drizzle`, `create`, `update`) | 30-40 |
| `src/lib/mcp/store.ts` | `McpPayload` (`find`, `findByID`, `create`) | 42-47 |
| `src/lib/comp/comp-issue-deps.ts` | `CompIssuePayload` (`find`, `findByID`, `create`, `db`) | 31-37 |
| `src/lib/performance-bulk-create.ts` | `BulkCreatePayload` (`db` tx trio, `create`) | 92-99 |
| `src/lib/app/account-data.ts` | `ResetTokenIssuer` (`forgotPassword`) | 11-18 |
| `src/lib/app/invite-data.ts` | `PayloadClient = Awaited<ReturnType<typeof getPayload>>` (the full type) | 21 |
| `src/lib/refund/build-refund-order-deps.ts`, `src/lib/dispute/build-dispute-deps.ts` | `Payload` (the full type) | 7, 9 |
| `src/lib/show-loaders.ts` / `stats-loaders.ts` | `ShowsFind`, `StatsInputDeps` | 35-45, 19-28 |
| `src/lib/access/member-logins.ts` | `UserLinkFinder` (`find`) | 22 |
| `src/lib/access/attendance-access.ts` | `MemberLinkReader` (`findByID`) | 73 |
| `src/lib/db/pool-query.ts` | `PoolQuery` (one method) | 11-23 |
| `src/lib/tickets/sold-seats.ts`, `sell-lock.ts`, `ticket-void.ts` | `PoolQuery`, `SellLockPool`, `TicketVoidExecutor` | 13, 15-21, 21-23 |

Tests already stub `getPayload` at the module boundary
(`src/app/api/route-permissions.test.ts:14-20`, `src/lib/access/route-guard.test.ts:9`).

---

## 2. Auth operations Cecilija's own pages rely on, and what replacing each would take

All of `/app`'s sign-in is Payload's, but none of it goes through `/admin/login`
or Payload's REST auth endpoints. The routes call the **local operations** and
build the cookie with Payload's own helpers, so the session is interchangeable
with `/admin` (`src/lib/app/login.ts:1-7`).

| Operation | Today | Phase B replacement |
|---|---|---|
| **2.1 Login** | `POST /api/app/login` (`src/app/api/app/login/route.ts:33-48`): `payload.login({ collection: 'users', data })` with either `email` or `username` (hybrid login, `src/collections/Users.ts:63-66`), then `generatePayloadCookie` from `payload/shared` with the Users auth config (30-day `tokenExpiration`, `Users.ts:55`; no custom `cookiePrefix`, so the name is `payload-token`, `src/lib/admin-i18n.ts:58`). Rules in `src/lib/app/login.ts` (pure). Also fires the `afterLogin` hook that seeds the `payload-lng` admin-language cookie (`Users.ts:91-114`), which Cecilija does not need. | Verify the password against `users.salt` / `users.hash` (`db/schema/00-base.sql:648-649`, Payload's own format; a phase B rewrite either keeps Payload's KDF for existing rows or forces a reset), honour `login_attempts` / `lock_until` (`00-base.sql:650-651`), mint a JWT with `PAYLOAD_SECRET` or a new secret carrying `id` and the session id, and write a `users_sessions` row (`00-base.sql:681-687`). The pure `handleAppLogin` already isolates the status codes and identifier rule. |
| **2.2 Logout** | `POST /api/app/logout` (`src/app/api/app/logout/route.ts:26-40`): `payload.auth` to find the caller, then Payload's `logoutOperation` on a `createLocalReq({ user })` so the `users.sessions` row is removed (Payload's `useSessions` default; the JWT alone would stay valid for 30 days, `logout/route.ts:10-15`), then `generateExpiredPayloadCookie`. | `DELETE FROM users_sessions WHERE _parent_id = $1 AND id = $2` plus an expired `Set-Cookie`. The `_sid` claim has to be in the token for this to keep working. |
| **2.3 Forgot password** | `POST /api/app/forgot` (`src/app/api/app/forgot/route.ts:44-65`): our own `find` on users (Payload's `forgotPassword` returns null silently for an unknown account and never tells us the address), then `issueAppResetToken` (`src/lib/app/account-data.ts:36-48`) = `payload.forgotPassword({ disableEmail: true, expiration })`. The expiration is passed per call (one hour here, seven days from the invitation) and only works because `Users.auth.forgotPassword.expiration` is deliberately unset (`Users.ts:67-80`). Croatian mail is ours (`send-moreskant-email.ts`). Rate-limited and always 200 (`forgot.ts`). | Generate a random token, store it in `users.reset_password_token` / `reset_password_expiration` (`00-base.sql:646-647`). Nothing else changes: the mail, the rate limit and the always-200 rule are already outside Payload. |
| **2.4 Set password / invitation landing** | `POST /api/app/set-password` (`src/app/api/app/set-password/route.ts:29-40`): `payload.resetPassword({ data: { token, password }, overrideAccess: true })`, which stores the hash **and** opens a session, then the same `generatePayloadCookie`. Rules in `src/lib/app/set-password.ts`. The invitation (`src/lib/app/invite-data.ts:69-80`) creates the Users row and mints the same kind of token. | Look up the token, check expiry, hash the new password, clear the token, then run the login path of 2.1. Password policy is whatever `handleSetPassword` enforces today. |
| **2.5 Sessions / "who is asking"** | `payload.auth({ headers })` in `requirePermission` (`route-guard.ts:40`), `resolveAppViewer` (`viewer.ts:62`), the four custom admin views and `scan/[token]/page.tsx:435`. Payload's JWT strategy loads the user with `overrideAccess: true`, so field-locked `permissions` and `member` ride along on `req.user` (`docs/agents/permissions.md:39`). `/app` re-reads the account and the Member anyway (`viewer.ts:65-84`). | Verify the JWT, check the `users_sessions` row is present and not expired, load `users` + `users_permissions` (`00-base.sql:664-669`) into the `PermissionUser` shape `can()` reads. `requirePermission` is already the single chokepoint, so the swap is one function. |
| **2.6 The `payload-token` cookie and the CSRF/Origin gate** | Two different gates exist. (a) Payload's own: when it extracts the cookie it accepts the request only if `Origin` is on the `csrf` allowlist (seeded from `serverURL` = `NEXT_PUBLIC_BASE_URL`, `src/payload.config.ts:111`) or, with no Origin, `Sec-Fetch-Site` is `none` / `same-origin` / `same-site` (`docs/agents/payload-admin.md:39-44`). A cross-site click into `/scan/[token]` therefore renders the buyer view. The `Authorization: JWT` header bypasses it. (b) Ours, for the unauthenticated cookie-setting POSTs: `rejectAppRequest` in `src/lib/app/request-guard.ts:86-102` (refuse `Sec-Fetch-Site: cross-site`, refuse a foreign `Origin`, require `Content-Type: application/json`), applied by login, logout, forgot, set-password and, after the permission check, by every `/app` write route. ADR-0023 records that `/app` depends on gate (a) unchanged (`docs/adr/0023-…md:30`). | Keep gate (b) as is; it has no Payload dependency. Re-implement gate (a) inside the phase B `auth()` so the behaviour on `/scan/[token]` (cookie ignored on a cross-site navigation) is preserved deliberately rather than lost, and keep the `Authorization` header path for probes. |
| **2.7 Payload's REST auth surface** | `/api/users/login`, `/api/users/me`, `/api/users/logout` under `src/app/(payload)/api/[...slug]/route.ts` serve `/admin` only. `/api/users/me` runs with `overrideAccess: false`, which is why a client-side voditelj sees no `permissions` on their own user (`src/lib/moreskant-admin-actions.ts:19-27`). | Nothing in `/app` calls these. They go with `/admin`. |
| **2.8 MCP tokens** | `oauth_codes` / `oauth_tokens` raw tables, `src/lib/mcp/oauth-store.ts`; the bearer names a Payload user id and `verifyToken` re-reads the account and re-checks `moreska` (`src/app/api/mcp/[transport]/route.ts:224-231`). | Only the user read changes (2.5). |

What replacing Payload auth would **not** touch: `can()/hasAny()`
(`src/lib/access/permissions.ts:67-77`), the `/app` access decision
(`src/lib/app/access.ts:57-76`), the request guard, the rate limiters, the mails,
the pure `handleAppLogin/Logout/Forgot/SetPassword` modules and their tests.

---

## 3. Hooks and field-level access rules a custom form must keep running

Two facts decide what is at risk:

- **Collection hooks run under the local API**, `overrideAccess` or not. A
  Cecilija form that writes through `payload.create/update/delete` keeps every
  hook below. A form that writes raw SQL (as the reschedule and venue-move
  routes already do) loses them and has to replace each one by hand, which is
  exactly what `src/lib/push/raw-save.ts` does for the push hook.
- **Field-level `access` does not run under `overrideAccess: true`**, and every
  `/app` and staff route runs that way. So a custom form gets *none* of the
  field locks below for free; the route handler's `requirePermission` is the
  only gate (CLAUDE.md hard rule). A denied field is silently dropped by
  Payload, not rejected (`docs/agents/payload-admin.md:16`), so a Cecilija form
  that wants to refuse a field has to refuse it explicitly.

### 3.1 Collection hooks

| Collection | Hook | What it does | Where |
|---|---|---|---|
| Users | `afterLogin` | Seeds the `payload-lng` admin-language cookie | `src/collections/Users.ts:91-114` (admin-only concern) |
| Users | `beforeValidate` | Email required when the set contains `users`, `tickets`, `moreska` or `moreskant` (`assertUserEmailPolicy`, `src/lib/access/user-email-policy.ts:43`); merges patch over `originalDoc` | `Users.ts:121-135` |
| Users (Payload built-in) | username lowercasing, uniqueness on `username` / `email` | From `loginWithUsername` | `Users.ts:258-272`, indexes `00-base.sql:1035,1051` |
| Members | `beforeDelete` ×2 | Cascade-delete `attendance` and `lineups` rows of the member (both FKs are `ON DELETE SET NULL` on a `NOT NULL` column, so the DB alone refuses the delete). Comp orders and promo codes are deliberately left pointing at NULL | `Members.ts:100-123, 159` |
| Members | `beforeValidate` | Moreškant profile invariants: `validateAndNormaliseMoreskant` (`src/lib/moreskant-profile.ts:141`), nickname required and unique among moreškanti (`otherNicknames`, `Members.ts:70-87`), `primaryRole` must be among `roles`, `ROLE_REQUIRES` (a king needs the plain army role), normalised `nickname` / `mobile` / `email` | `Members.ts:164-192` |
| Members | `hasLogin` field `afterRead` | Virtual column filled from `users.member` by one memoised `find` per request | `Members.ts:316-349`, `src/lib/access/member-logins.ts:56` |
| Shows | `beforeDelete` ×2 | Cascade-delete `attendance` and `lineups` of the performance, in the delete's transaction | `Shows.ts:73-96, 143` |
| Shows | `beforeValidate` | (a) `nonPublicAuthoringOverrides`: a `moreska`-without-`tickets` user can never author a public row (`src/lib/access/shows-access.ts:160`); (b) `validateAndNormalisePerformance` (`src/lib/show-performance.ts:88`): public ⇒ venue required and `kind='redovna'` ⇒ public; non-public ⇒ location required and the sales counters and `onlineSalesPaused` zeroed; `time` format | `Shows.ts:154-187` |
| Shows | `afterChange` | `notifyRosterOnShowChange` (`src/lib/push/shows-hook.ts`): pushes on create and on a change of date, time, place, cancelled status or `voditeljNote`; releases alarm/reminder claims on a moved start | `Shows.ts:149` |
| Shows | `time` field `validate` | `HH:MM` | `Shows.ts:205-211` |
| Orders | `beforeDelete` | Cascade-delete the order's tickets in the same transaction (`tickets.order_id` is `NOT NULL` with `SET NULL`) | `Orders.ts:26-33, 52` |
| Posts | `slug` field `beforeValidate` | Slugify from title | `Posts.ts:56-68` |

Unique indexes that Payload's push never emits and only `db/schema` carries:
`attendance (performance, member)` (`migrate-zz-attendance.sql`), `lineups
(performance, member)` (`migrate-zz-b-lineups.sql`, noted in `Lineups.ts:14-17`).
A custom writer that upserts on those pairs relies on the index, not on a hook.

### 3.2 Field-level access rules (all silently dropping the field when denied)

| Collection | Field(s) | Rule | Where |
|---|---|---|---|
| Users | `permissions`, `shared` | read/update/create only if `can(user,'users')`. This is what stops self-promotion, because `Users.access.update` allows self-edit (`userUpdateAccess`, `src/lib/access/user-self-update.ts:24`; a `shared` account may never edit itself) | `Users.ts:176-187, 204-208` |
| Users | `partner` | update/create `users` only; read left open so it rides on `req.user` for `partnerOwn*Where` | `Users.ts:226-230`, `src/lib/access/partner.ts:41-56` |
| Users | `member` | read/update/create `users` only | `Users.ts:252-256` |
| Users | `username` | update/create `users` only (declared solely to merge the lock into Payload's base field) | `Users.ts:265-272` |
| Members | `name` | update `tickets` only (create open so a voditelj can add a dancer) | `Members.ts:195-203`, `canEditAttributionField` `members-access.ts:90` |
| Members | `active`, `note` | update and create `tickets` only; `active` falls back to `defaultValue: true` when stripped | `Members.ts:204-224` |
| Members | `isMoreskant`, `nickname`, `mobile`, `email`, `roles`, `primaryRole` | read/update/create `moreska` only (`MORESKANT_FIELD_ACCESS`) | `Members.ts:44-48, 228-308` |
| Members | `hasLogin` | read `moreska`; never writable | `Members.ts:329-335` |
| Shows | `date`, `time`, `kind`, `venue`, `onlineSold`, `inPersonSold`, `legacyReserved`, `status`, `onlineSalesPaused` | update via `canEditScheduleField(user, doc)`: `tickets` always, `moreska` only on a non-public row | `Shows.ts:30-36, 199-355`, `shows-access.ts:112` |
| Shows | `isPublic` | create/update `canSetPublicFlag` (`tickets`); the hook is the backstop because a denied field falls back to `defaultValue: true` | `Shows.ts:251-255`, `shows-access.ts:98` |
| Shows | `location`, `client` | update `canEditPlacementField` | `Shows.ts:279, 288`, `shows-access.ts:137` |
| Shows | `venueChangedAt/By`, `dateChangedAt/By`, `originalDate` | update never (`() => false`); written only by the raw-SQL routes | `Shows.ts:367-415` |
| Shows | `thresholdCrni`, `thresholdBili`, `lineupConfirmed`, `lineupConfirmedAt`, `voditeljNote` | read/update `moreska` only | `Shows.ts:428-473`, `shows-access.ts:124-129` |
| Orders | `compIssuedBy` | editable by `tickets` in `/admin` on purpose (the "give a dancer their four back" lever); the attribution links `partner`, `member`, `promoCode` are `readOnly` in the admin but **not** access-locked | `Orders.ts:95-133`, `docs/agents/permissions.md:45` |

### 3.3 Collection-level access that currently doubles as a business rule

These predicates live in `src/lib/access/*.ts` and are already pure; a Cecilija
route can call them directly instead of relying on Payload to apply them:

- Shows: `showsReadAccess` (`door` gets `isPublic = true` only), `showsCreateAccess` / `showsDeleteAccess` (`moreska` limited to `NON_PUBLIC_PERFORMANCE_WHERE`) (`shows-access.ts:27-90`).
- Members: read/create/update `tickets` or `moreska`, delete `tickets` only (`members-access.ts:28-58`).
- Attendance: `moreska` writes; `moreskant` reads own rows via an **async** predicate that re-reads `Users.member` (`attendance-access.ts:31-102`); write predicate is a boolean, never a `Where` (`Attendance.ts:27-31`).
- Lineups: `moreska` writes; `moreskant` reads only `performance.lineupConfirmed = true` (`lineup-access.ts:37-57`).
- Orders / Tickets / Partners: `tickets`, or the partner's own rows via `partnerOwn*Where` (`Orders.ts:41-45`, `Tickets.ts:20-24`, `Partners.ts:17-21`).
- The rules that are **not** in collection access at all and live only in a route's pure module: attendance "only before the izvedba starts" (`src/lib/attendance/rules.ts`, per `docs/agents/permissions.md:41`), the self-comp cap and time window (`src/lib/comp/self-comp.ts`), the lineup lock order (`src/lib/lineup/write-tx.ts`), the storno same-day window (`src/lib/partner/storno.ts`), comp scoping (`src/lib/comp/cancel-comp.ts:8-16`).

### 3.4 What the two REST writers get today

`CancelShowMenuItem.tsx:26-30` (`PATCH /api/shows/:id`) and
`MarkHandledMenuItem.tsx:29-33` (`PATCH /api/contact-submissions/:id`) are the
only writes that go through Payload's REST, so they are the only custom writes
where collection access, field access **and** hooks all apply. Cancelling a
show through REST fires the `afterChange` push and the field lock on `status`.
A Cecilija cancel button has to call a route that does the same (the push via
`notifyRawPerformanceSave` or a local-API `update`, and the mails the current
menu item leaves to the operator).

---

## 4. What the stock list/edit views do today that a custom form must replicate

Per collection, from `admin` and `fields` in `src/collections/*.ts`. "Required"
and "options" are enforced by Payload's validation on every local-API write as
well, so a custom form loses only the *UI* half of them, not the check.

| Collection | `useAsTitle` | `defaultColumns` | Validation the view surfaces | Relationship pickers / conditions / components |
|---|---|---|---|---|
| Users (`Users.ts:146-284`) | `email` | (default) | `permissions` required multi-select over `PERMISSIONS` with EN/HR labels (`Users.ts:17-27, 163-175`); `username` unique + required; email policy 400 from the hook | `partner` picker shown only when the form's `permissions` includes `partner` (`showPartnerLinkField`, `Users.ts:32-35, 246`); `member` picker; `logout` ui field. Hidden from the sidebar unless `users`. |
| Shows (`Shows.ts:106-138`) | `date` | `date, time, kind, isPublic, venue, location, client, onlineSold, inPersonSold, legacyReserved, status, onlineSalesPaused` | `date` required (day picker), `time` HH:MM validator, `kind` required select of 5, `isPublic` required checkbox, `venue` select of 2 with capacity in the label, `status` select, `thresholdCrni/Bili` required min 0 default 8; hook 400s | Six fields on `publicPerformanceOnly` condition (`Shows.ts:50-56`); `inPersonSold` / `legacyReserved` `readOnly` since ADR-0025; five audit fields `readOnly`; `venueChangedBy` / `dateChangedBy` relationship to users; five edit-menu items + one list action (bulk create link). Hidden unless `tickets` or `moreska`. |
| Orders (`Orders.ts:54-75`) | `buyerName` | `buyerName, email, adultCount, childCount, total, compIssuedBy, refundStatus, show` | `channel` required select, `adultCount/childCount/total` required numbers, `refundStatus` required select (`none|refunded`), `show` required relationship, `code` unique, `email` type `email` | `listSearchableFields: ['buyerName','email']`; `partner`, `member`, `promoCode` relationship pickers `readOnly`; two edit-menu items. Hidden unless `tickets`. |
| Tickets (`Tickets.ts:29-81`) | (id) | `token, order, type, status, scanned, scannedAt` | `token` unique required, `order` required relationship, `type` / `status` required selects, `cancelReason` select | `cancelledAt` readOnly. Hidden unless `tickets`. |
| Partners (`Partners.ts:27-70`) | `name` | `name, commissionPercent, active` | `name` required, `commissionPercent` required 0..100 default 10 | `users` join field (reverse of `Users.partner`). Hidden unless `tickets`. |
| Members (`Members.ts:137-155`) | `name` | `name, nickname, primaryRole, isMoreskant, hasLogin, active` | `name` required; `roles` multi-select and `primaryRole` select over `DANCE_ROLES` with labels; hook 400s for nickname uniqueness and role invariants | Six fields on the `moreskantOnly` condition (`Members.ts:57-58`); `hasLogin` virtual readOnly; one edit-menu item, one list-menu item (invitations). Hidden unless `tickets` or `moreska`. |
| PromoCodes (`PromoCodes.ts:28-92`) | `code` | `code, member, adultPriceEur, active` | `code` unique required, `member` required relationship, `discountType` required select (one option), `adultPriceEur` required min 0 default 15 | `member` picker. Hidden unless `tickets`. |
| Attendance (`Attendance.ts:53-120`) | `id` | `performance, member, status, army, answeredAt` | `performance` / `member` required relationships, `status` required select, `army` select | `answeredBy` relationship to users; `answeredAt` day-and-time picker. Hidden unless `moreska`. |
| Lineups (`Lineups.ts:45-84`) | `id` | `performance, member, role` | required relationships, `role` required select over `DANCE_ROLES` | Hidden unless `moreska`. |
| ContactSubmissions (`ContactSubmissions.ts:15-55`) | `name` | `name, email, enquiryType, status, createdAt` | `name`, `email`, `enquiryType` (select of 4), `status` (select `new|handled`, sidebar), `message` required | One edit-menu item (mark handled). Hidden unless `tickets`. |
| OrderLookups (`OrderLookups.ts:21-47`) | (id) | `user, show, query, matchedOrderId, createdAt` | none | `user`, `show` relationships. Audit only; stays in `/admin` per #471 (out of scope). |
| Posts, Faqs | `title` / `question` | see `Posts.ts:39-40`, `Faqs.ts:23-24` | Lexical rich text (`answer`, post body), slug hook | Stay in `/admin` per #471. |

Cross-cutting behaviours of the stock views that a Cecilija table or form
replaces:

- **Relationship pickers** load options through Payload REST `GET /api/<slug>` with the caller's collection access, so a picker for `members` shows a `tickets` holder the attribution half only (field read locks strip the moreškant fields). A custom picker calls a route that applies the same projection by hand.
- **List search, sort, pagination** are Payload's query language over `where`; the only bespoke search config is `listSearchableFields` on Orders. The secretary's desktop table needs (#471 "Desktop table UX") are not specified yet.
- **Bulk operations** (select many, delete) fire `beforeDelete` per document (`Orders.ts:25`, `Shows.ts:72`), which is what makes the cascades hold for bulk deletes.
- **Admin i18n**: labels are `{ en, hr }` objects on fields and collections; Cecilija is Croatian-only, so only the `hr` half is needed.
- **`admin.hidden` predicates** and the `dashboardBranchFor` branching (`src/lib/dashboard/branch.ts`) are the stock navigation; Cecilija's tab bar replaces both.

---

## 5. Raw tables that already bypass Payload

All are created only by `db/schema/*.sql`, are never in `payload.config.ts`, and
are read and written through the one-method `PoolQuery`
(`src/lib/db/pool-query.ts:11-23`). Their Postgres pool is still Payload's
(`payload.db.pool`), which is the only Payload dependency left in these modules.

| Table | Schema | Reader / writer | Purpose |
|---|---|---|---|
| `offline_sales` | `db/schema/migrate-zz-da-offline-sales.sql:65-81` | `src/lib/offline-sales/data.ts` (transaction with the `shows` counters) | Door + legacy seat ledger (ADR-0025) |
| `marketing_optouts` | `db/schema/app.sql:353` | `src/lib/marketing/opt-out.ts` (read), `src/app/api/unsubscribe/route.ts` (write) | Review-email consent (#57) |
| `critical_events` | `db/schema/app.sql:369-387` | `src/lib/critical-events/record.ts`, `list.ts`; the dispute claim in `build-dispute-deps.ts` (partial unique index on `context->>'disputeId'`) | Ops log + idempotency claim (#380) |
| `push_subscriptions` | `db/schema/migrate-push.sql:40-54` | `src/lib/push/store.ts:23-84` | Roster devices (#431) |
| `performance_notifications` | `db/schema/migrate-push.sql:69-79` | `src/lib/push/store.ts:144-182` (atomic claim) | Notification claims (#435) |
| `oauth_codes`, `oauth_tokens` | `db/schema/migrate-zz-d-oauth.sql:37-77` | `src/lib/mcp/oauth-store.ts` | MCP credentials (#438) |

Payload-owned tables that are nonetheless **also written or read raw** today:

- `tickets`: `UPDATE … WHERE scanned=false` (`scan-deps.ts:22-30`), the void and reactivate statements (`src/lib/tickets/ticket-void.ts`), the claim route, seat counts (`sold-seats.ts`).
- `shows`: `UPDATE` in the reschedule and venue-move routes; the offline-sales counter cache; `SELECT … FOR UPDATE` in `lineup-store.ts`.
- `orders`, `users`, `users_permissions`: the season revenue query (`stats-data.ts:31`), `loadRefundContext`, partner reconciliation, `loadVoditeljUserIds` (`push/store.ts:126-135`, because a `hasMany` select lives in a join table Payload's `contains` cannot query), the review-email dispatch.

The cross-source invariant to remember when a Cecilija form writes any of
these: raw writes to `shows` bypass the `beforeValidate` normalisation and the
`afterChange` push; raw writes to `tickets` bypass nothing (Tickets has no
hooks), which is why the atomic ticket statements were safe to move first.

---

## 6. Proposed thin repository seam

### 6.1 What the seam is for

Phase B replaces three things: `payload.auth` and the login operations
(section 2), the local API on 13 collections, and the `payload.db.*` handle the
raw modules borrow. The seam's job is to make each of those a single module so
that phase B is "reimplement N files" rather than "audit 70 call sites". It is
**not** a general ORM and it must not hide the SQL the atomic paths depend on.

### 6.2 Module boundary and naming

```
src/lib/repo/
  index.ts          // getRepo(): Repo (memoised like getPayload)
  types.ts          // the Repo interface and the row projections
  auth.ts           // AuthRepo: session, login, logout, resetToken, setPassword
  db.ts             // DbRepo: query (PoolQuery), transaction, lockedQuery
  shows.ts          // ShowsRepo
  orders.ts         // OrdersRepo (orders + tickets)
  members.ts        // MembersRepo
  users.ts          // UsersRepo
  partners.ts       // PartnersRepo
  promo-codes.ts    // PromoCodesRepo
  attendance.ts     // AttendanceRepo
  lineups.ts        // LineupsRepo (wraps lineup-store.ts as is)
  inquiries.ts      // InquiriesRepo (contact-submissions)
  payload/          // the ONLY directory that imports 'payload' or '@payload-config'
    client.ts       // getPayload wrapper, poolOf(), drizzleOf()
    *.ts            // one Payload-backed implementation per repo above
```

Naming: `Repo` suffix on interfaces, `create<Name>Repo(payload)` on the Payload
implementations, `getRepo()` for the composed default. The projection types are
the ones the pure modules already define (`AppMember`, `AttendanceMember`,
`RefundOrderRecord`, `CompIssueShow`, `PartnerSaleShow`, `SelfCompOrder`); the
repo returns those, never a Payload document. The `relationId` helpers
(`src/lib/payload-relation.ts`) move into `repo/payload/` because "a relationship
arrives as an id or a document" is a Payload fact.

### 6.3 Interface sketch

```ts
// src/lib/repo/types.ts
export interface Repo {
  auth: AuthRepo
  db: DbRepo
  shows: ShowsRepo
  orders: OrdersRepo
  members: MembersRepo
  users: UsersRepo
  partners: PartnersRepo
  promoCodes: PromoCodesRepo
  attendance: AttendanceRepo
  lineups: LineupsRepo
  inquiries: InquiriesRepo
}

export interface AuthRepo {
  /** The caller behind a request, or null. The PermissionUser shape can() reads. */
  userFromHeaders(headers: Headers): Promise<SessionUser | null>
  login(credentials: { username: string } | { email: string }, password: string): Promise<{ token: string; setCookie: string; user: SessionUser } | null>
  logout(user: SessionUser): Promise<{ setCookie: string }>
  issueResetToken(target: { username?: string; email?: string }, expirationMs: number): Promise<string | null>
  resetPassword(token: string, password: string): Promise<{ setCookie: string; user: SessionUser } | null>
}

export interface DbRepo {
  query: PoolQuery                                   // src/lib/db/pool-query.ts
  connect(): Promise<SellLockClient>                 // for withShowSellLock
  execute: TicketVoidExecutor['execute']             // drizzle.execute, for the atomic ticket statements
  transaction<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T>
}

export interface ShowsRepo {
  byId(id: Id, opts?: { tx?: TxHandle }): Promise<ShowRow | null>
  find(where: ShowsWhere, opts?: { sort?: string; limit?: number }): Promise<ShowRow[]>
  create(data: NewShow, ctx: WriteCtx): Promise<ShowRow>            // through Payload: hooks fire
  update(id: Id, patch: Partial<ShowRow>, ctx: WriteCtx): Promise<ShowRow>
  // deliberately no delete in v1: deletion stays a /admin raw edit
}

/** Who is writing. Carried so the Payload implementation can pass `req.user` (hooks read it) and `transactionID`. */
export interface WriteCtx { user: SessionUser | null; tx?: TxHandle }
```

The other collection repos follow the same three-method shape (`byId`, `find`
with a typed `where` narrowed to the predicates actually used, `create`/`update`
with a `WriteCtx`), plus the one or two named queries each screen needs
(`OrdersRepo.byPaymentIntent`, `OrdersRepo.isCodeUnique`,
`MembersRepo.activeMoreskanti`, `UsersRepo.byIdentifier`,
`UsersRepo.memberIdsWithLogin`, `AttendanceRepo.byPerformanceAndMember`).

Two rules inside the seam:

- **Writes go through Payload's local API in phase A** so the hooks in 3.1 keep running. The seam passes `overrideAccess: true` (it always was) and `req: { user, transactionID }` so `beforeValidate` sees the caller and the cascades share the transaction.
- **The atomic statements stay verbatim** in their owning modules (`ticket-void.ts`, `scan-deps.ts`, `sell-lock.ts`, `sold-seats.ts`, `offline-sales/data.ts`, `lineup-store.ts`, the raw-table stores). They take `DbRepo.query` / `execute` / `connect` instead of reaching into `payload.db`. That is a mechanical substitution; the SQL does not move.

### 6.4 What goes through the seam in v1 versus stays direct

| Goes through `getRepo()` in v1 | Stays direct in v1 | Why |
|---|---|---|
| Every **new** Cecilija route and page (the nine v1 screens) | `src/app/(frontend)/**`, `src/app/actions/*`, `src/lib/shows.ts`, `posts.ts`, `faqs.ts` | Public site is out of the map; its four reads are simple and covered by the guard test. |
| `requirePermission` (becomes `repo.auth.userFromHeaders` + `can`) | `src/app/(payload)/**`, `src/components/payload/**` | The admin shell is retired at the end of v1, not migrated. |
| The four `/app` auth routes and `viewer.ts` (section 2), because the moreškant section moves as-is and they are the only login pages Cecilija will have | Stripe webhook, cron routes | Signature/secret-authed and tested end to end; migrate in phase B, not v1. |
| The `*-data.ts` / `*-deps.ts` modules of section 1.12, by changing their parameter from a Payload slice to the matching `*Repo` (their local interfaces already are the seam, under other names) | Raw-table stores (`push/store.ts`, `oauth-store.ts`, `opt-out.ts`, `critical-events`, `offline-sales/data.ts`) | They already take `PoolQuery`; only the caller that obtains the pool changes (`poolQuery(payload)` → `repo.db.query`). |
| The two REST writers (cancel show, mark handled) become routes on the seam | `scan/[token]/page.tsx` and `scan-deps.ts` | Move when the scan screen is rebuilt (first v1 screen), through `DbRepo.execute`. |

Adoption order follows the map's screen order (scan, orders, performances,
partner sales, comp + promo, moreškant, users, statistics, inquiries): each
build ticket migrates the routes it touches and nothing else. The
"Repository seam adoption" item under *Not yet specified* in #471 is answered
by that table: existing call sites migrate when their screen is rebuilt, not in
a sweep.

### 6.5 Tests that come with the seam

- A file-scan test in the shape of `src/lib/show-performance-guard.test.ts` and `src/lib/db-schema-safety.test.ts`: any file under `src/app/app/**`, `src/app/api/app/**` or the new Cecilija route group that imports `'payload'` or `'@payload-config'` fails unless it is `src/lib/repo/payload/*`. Existing call sites go on an allow-list with the screen that will retire them, so the list shrinks per build ticket.
- `route-permissions.test.ts` keeps its shape: it stubs `getRepo()` instead of `getPayload()`.
- A fake `Repo` (in-memory maps) for the pure modules' route tests, replacing the ad-hoc `{ auth, find, findByID, db: { pool: { query } } }` stubs at `route-permissions.test.ts:14-18`.

### 6.6 The rule for CLAUDE.md

Under *Hard rules*:

> **New staff-app code never imports `payload` or `@payload-config` directly.** Cecilija routes, pages and their `*-data.ts` modules read and write through `getRepo()` from `src/lib/repo` (ADR pending, #475): `repo.auth` for the session and the login operations, `repo.<collection>` for documents, `repo.db` for the atomic SQL modules. `src/lib/repo/payload/` is the only place that may import Payload. Writes still go through the local API inside the seam so collection hooks (cascade deletes, `Members`/`Shows` `beforeValidate`, the roster push) keep running; field-level access never applies to these writes, so a form that must refuse a field refuses it in its route. Existing call sites migrate when their screen is rebuilt (`docs/research/cecilija-payload-seam.md`, section 6.4) and are listed in the seam's allow-list until then.

And one line in the *Key files* table: `src/lib/repo/`, the repository seam between the staff app and Payload (phase A); phase B reimplements `repo/payload/` and nothing above it.

### 6.7 Open questions for the ADR that records this

1. Whether `ShowsRepo.update` for the reschedule and venue-move actions should switch from raw SQL to the local API now (gaining the `afterChange` push for free and retiring `push/raw-save.ts`) or stay raw with the hand-rolled push until phase B.
2. Whether `WriteCtx.user` is enough for `nonPublicAuthoringOverrides` (`Shows.ts:164-168` reads `req.user.permissions`) once phase B has no `req`.
3. Whether the field-level locks of 3.2 get a pure twin (`canWriteField(user, collection, field)`) in `src/lib/access/` so Cecilija forms and the eventual phase B validator share one table, or stay Payload-only until `/admin` is retired.
