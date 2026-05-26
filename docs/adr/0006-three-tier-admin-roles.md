# ADR-0006: Three-tier admin roles (superadmin / admin / tehnika)

**Status:** Accepted
**Date:** 2026-05-26

## Context

The Payload `/admin` shipped with two roles: `admin` and `door-staff` ([ADR-0002](./0002-auth-gated-scan-shared-url.md)). In practice the `admin` tier conflated two distinct user populations: the developer (Josip, who needs to manage users and operate Payload as a CMS) and the HGD secretaries (non-technical users who add shows, look up orders, and read inquiries). The secretary tier needs `/admin` to look like a friendly task dashboard, not a list of database collections. It must not include user-management surfaces. Secretaries should be able to edit their own profile but not see, create, or promote other users.

A separate friction point: the Payload dashboard landed every user (including the door volunteers) on a grid of collection cards labelled "Shows / Orders / QRTokens / ...". A secretary or a tehnika volunteer reading "QRTokens" has no idea what that is.

## Decision

Introduce a third role and rename one existing role. The role enum on `Users.role` becomes `superadmin | admin | tehnika`:

- **`superadmin`**: developer tier. Can do everything in `/admin`, including user management. A new helper `isSuperadmin` gates the one callsite that means "developer only" (Users CRUD).
- **`admin`**: secretary tier. Can do everything the developer can *except* user management. All existing `isAdmin` callsites (Orders, Shows, ContactSubmissions, Posts, QRTokens, refund route, stats PII view) keep their old semantics under a renamed helper `isAdminTier` that returns true for superadmin OR admin. The string `admin` is reused. Pre-existing `admin` rows are migrated selectively: only Josip's account becomes `superadmin`; the other rows stay `admin` (their meaning shifts to "secretary").
- **`tehnika`**: door-staff tier. Renamed from `door-staff` to match the shared login string already in use (`tehnika@moreska.eu`, see [ADR-0004](./0004-email-infrastructure.md)). Behaviour is identical to the previous `door-staff` role: read-only stats access, authenticated `/scan/[token]`, undo-scan-within-2-minutes.

`Users.role` gets field-level access: only `isSuperadmin` can read or write the role field, so a secretary editing her own profile cannot promote herself. The Users collection itself is hidden from the admin sidebar via `admin.hidden`. Per-role sidebar visibility on every collection is set the same way: superadmin sees everything; admin sees Shows / Orders / QRTokens / ContactSubmissions; tehnika sees nothing in the sidebar. The `/admin` landing route renders a custom dashboard component that branches on role: superadmin/admin see action buttons + season aggregate + recent shows; tehnika sees the stats-only view (collapsing the previous `/admin/stats` URL into `/admin`).

Migration is a one-shot idempotent SQL block in `db/schema/` (per the bootstrap pattern):

```sql
UPDATE users SET role = 'superadmin'
  WHERE role = 'admin' AND email = 'josip.ivancevic00@gmail.com';
UPDATE users SET role = 'tehnika' WHERE role = 'door-staff';
-- other 'admin' rows (the two existing secretaries) stay 'admin' by design
```

## Alternatives considered

**Numeric role level (e.g. `level: 1 | 2 | 3`).** Rejected. Numbers don't read in Payload's select dropdown ("level 2"?) and we don't need a true hierarchy lattice. Three discrete strings cover every check the code makes. Strings also survive grep more cleanly than numeric comparisons.

**Permission flags on the user (e.g. `canManageUsers: bool`, `canIssueRefunds: bool`, ...).** Rejected. Real per-flag flexibility isn't needed. The secretary set and the developer set are stable. Flag-based access creates a combinatorial explosion of states to test and offers no benefit over three clearly-named tiers.

**Payload's roles-collection pattern (separate Roles collection with permissions records).** Rejected as overkill. HGD has 3 to 5 total `/admin` users for the foreseeable future. The Payload "roles collection" pattern is for products with end-customer-defined RBAC, not three internal users.

**Keep `admin` for the dev tier and add a new role called `secretary` or `staff`.** Rejected because the everyday natural-language label is "the secretary is an admin of the site". She expects her role to *be called* admin. Migrating Josip's existing `admin` row to `superadmin` is a one-line UPDATE and lets the secretary's role string match the colloquial label.

**Fully custom admin shell (replace Payload's collection list/edit views).** Rejected for now. The pain point in user feedback was the *landing page* (collection grid), not the edit forms. Payload's field-by-field forms are fine when configured cleanly. Custom forms remain available as a per-screen escalation if the secretary reports specific UX problems after using the system.

## Consequences

- Three places must check role in three different ways:
  - `isSuperadmin(user)`: Users CRUD only.
  - `isAdminTier(user)`: Orders, Shows, ContactSubmissions, Posts, QRTokens, refund route, PII columns in stats. (Old `isAdmin` semantics; helper renamed for clarity.)
  - `isAuthed(user)`: any of the three roles. Scan undo, Shows read.
- The Stats dashboard at `/admin/stats` becomes `/admin` itself (the route is collapsed into the dashboard). The old URL can either redirect or be deleted (internal-only, no SEO concern).
- `Users.auth.tokenExpiration` is raised to 30 days so the shared `tehnika@moreska.eu` device stays logged in across long stretches without exposing a true never-expire session. Same expiry applies to admin/superadmin: re-logging in daily would annoy the secretary, and password rotation invalidates if a device is lost.
- The migration is idempotent. Running it twice is a no-op because the WHERE clauses match only old role strings. Safe under the existing `scripts/bootstrap-db.mjs` re-run on every deploy.
- Adding a new tier later (e.g. `accountant` who sees Orders but not Shows) requires a Payload select option, a SQL backfill, and one new helper. The pattern accommodates it without refactor.
- The buyer-side `/scan/[token]` path is unaffected. It still branches on "authed AND any admin tier" via `isAuthed`, and the `tehnika` rename doesn't change behaviour.
- An in-browser QR scanner (lazy-loaded `html5-qrcode`) is added to the tehnika dashboard so door volunteers can scan from a live viewfinder in `/admin` instead of bouncing between the camera app and Safari. The existing `/scan/[token]` URL keeps working for native-camera fallback.
