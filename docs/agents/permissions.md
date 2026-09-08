# Permissions and access

Decision record: [ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md). Domain wording: the *Permission* entry in `CONTEXT.md`. Source of truth in code: `src/lib/access/permissions.ts`.

A user holds a **set** of permissions. There is no role tier, no `isAdminTier`, no "superadmin" entity. Anything that reads like a tier is a bug.

## The vocabulary

Nine words, listed once in `src/lib/access/permissions.ts`. Never re-type the list in a collection, a route or a component; import `PERMISSIONS` or the `Permission` type.

| Permission | Grants |
|---|---|
| `users` | Account administration: create, delete and edit users and their permission sets. The only permission that can grant permissions, so "superadmin" just means holding all nine. |
| `tickets` | The ticketing backoffice: orders, shows, tickets, partners, members, promo codes, contact submissions, order lookups. |
| `refunds` | Issuing a refund. |
| `door` | Scanning a ticket, looking a code up, the door dashboard. Reads shows and tickets, nothing else. |
| `partner` | A reseller login, scoped to its linked Partners record. |
| `season_stats` | The shared read-only season ticket dashboard (ADR-0022). |
| `moreska` | Moreška roster tools, the voditelj's view (ADR-0024). Gates the Shows collection since #408: every performance is readable, non-public ones are the voditelj's to create and delete, and the roster fields are theirs alone. |
| `moreskant` | A moreškant's own roster view at `/app` (ADR-0024). Since #421 it is the dancer half of the `/app` access decision; since #422 it also scopes the `attendance` collection to the dancer's own rows. On Members and Users it grants nothing, so a `moreskant` login reaches no collection but its own row and its own answers. |
| `dev` | Developer diagnostics: the dev strip and the critical-events strip (ADR-0016). |

## The predicates

- `can(user, 'refunds')`: the single access predicate. Null user, empty set, or a word outside the vocabulary all mean **false**. Never "everything".
- `hasAny(user, ['tickets', 'door'])`: "at least one of". An empty list denies; it is not a wildcard.
- `requirePermission(req, 'refunds')` in `src/lib/access/route-guard.ts`: the single route chokepoint, because Payload's local API runs `overrideAccess: true` and collection `access` therefore does not gate a route handler. 401 without a session, 403 without the permission. Token- and signature-authed routes (Stripe webhook, `/scan/[token]/claim`, `/order/[token]/refund`, unsubscribe, cron) are the only sanctioned exceptions: they have no session user to check.
- Partner ownership scoping is **not** the guard's job. Derive it from `src/lib/access/partner.ts` (`partnerOwnOrdersWhere`, `partnerOwnTicketsWhere`, `partnerOwnRecordWhere`) and pass it as a `where`.

An unknown permission string is dropped rather than fatal, so a stale or hand-edited row stays safe.

## Gotchas

- **Staff wins over reseller.** A `users` holder holds `partner` too, so a bare `can(user, 'partner')` would flip the developer into the reseller branch of a route that serves both. Use `actsAsPartner()` from `partner.ts`, which is `partner && !tickets`.
- **A `partner` holder with no Partners link owns nothing**, never everything. The `Where` helpers return `false` (Payload reads that as "match nothing"), which is why the `users` holder (permission but no link) scopes to nothing there and reaches partner data through the `tickets` branch instead.
- **A performance is one row, three audiences.** `Shows` access is the first thing `moreska` gates (#408): the predicates live in `src/lib/access/shows-access.ts`, not in the collection. `door` reads a `Where` on `isPublic = true`; a `moreska`-only holder reaches every row but may create and delete only non-public ones, and the field-level locks refuse the date, time, kind, venue, status, sales counters and the public flag on a public show. The invariant "a voditelj can never author a public row" is carried by the collection's `beforeValidate` hook, not by field access: Payload enforces field access *before* validation and replaces a denied value with the field's `defaultValue`, which for `isPublic` is `true`.
- **Field-level locks are what stop self-promotion.** `Users.access.update` allows self-edit, so `permissions` and `shared` each carry `access: { read, update, create }` locked to `can(user, 'users')`. The `partner` link locks only `update` and `create`: its read stays open deliberately, because the value has to ride along on `req.user` for the ownership scoping in `partner.ts` to find it. A field that fails the predicate is silently dropped from the write, with no error to the caller, so a missing lock fails open and quietly.
- **A Member is one row, two audiences.** Like Shows, `Members` is shared by the backoffice and the voditelj since #420, and the predicates live in `src/lib/access/members-access.ts`, not in the collection. Read, create and update are `tickets` **or** `moreska`; delete stays `tickets` (a Member row carries comp history, so a voditelj retires a dancer with `active`, never by deleting). The split is field-level: the six moreškant fields (`isMoreskant`, `nickname`, `mobile`, `email`, `roles`, `primaryRole`) lock **read and update** to `moreska`, so a `tickets`-only form is the ADR-0019 attribution form it always was; `name`, `active` and `note` stay writable by `tickets` only — on create as well as on update for `active` and `note`, while `name` is left creatable, because a voditelj adds a dancer and the field is required (Payload falls back to `defaultValue` for a stripped field, so a voditelj's new member is still `active`). The sidebar is hidden from anyone holding neither.
- **`Users.member` is the dancer link and is locked to `users` for read and update**, unlike `Users.partner` (whose read stays open). The write lock is what stops a moreškant repointing themselves at someone else's roster identity; the read lock keeps the link out of any API response they can fetch. It does **not** hide the value from `req.user`: Payload's JWT strategy loads the account through the local API with `overrideAccess: true` (the same reason `permissions` reaches `can()`), so field locks never apply to the session. `/app` still re-reads the account and the Member with `overrideAccess` in `src/lib/app/viewer.ts` — defence in depth against a session issued before a relink, not a necessity.
- **Shared accounts.** `Users.shared` is the only marker (the door `tehnika` login, the society-wide `member` login). `userUpdateAccess` denies a shared account self-edit, so one volunteer cannot rotate the password and lock the others out. Do not infer "shared" from a permission set.
- **Attendance is the voditelj's table; a dancer only reads their own rows** (#422, `src/lib/access/attendance-access.ts`). `moreska` reads and writes everything; a `moreskant` gets `{ member: { equals: <own> } }` on **read** and nothing on create, update or delete; nobody else reaches the collection, the ticketing backoffice included, and the sidebar entry is `moreska`-only. Three gotchas. The read function is **async**, because `Users.member` is field-locked to `users` and the link therefore has to be re-read with `overrideAccess` (`resolveOwnMemberId`, the same move `/app`'s viewer makes). A `Where` must never be returned from a write predicate here: Payload's create operation only checks the result for truthiness, so it would read as a plain "allowed" and let a dancer POST a row for anybody through the same session cookie `/app` issues. And the *time* rule ("only before the izvedba starts") is deliberately nowhere in collection access — it cannot be expressed against a relation without a join, so it lives in the answer route's pure rules, which is the only writer the app uses.

- **Email is required for a named individual**, decided from the set, not a tier: `users`, `tickets`, `moreska` or, since #420, `moreskant` (`src/lib/access/user-email-policy.ts`). A dancer's login is created by an invitation email, so an inbox is part of the bundle. Door, partner and season_stats accounts are username-only.
- **Admin chrome language** defaults from the set too (`src/lib/admin-i18n.ts`): English for a `dev` holder or a door-only account, Croatian otherwise. The user's own `payload-lng` choice always wins.

## The legacy `role` column is gone

`users.role` and `enum_users_role` were dropped in #398 (`db/schema/migrate-zz-drop-users-role.sql`), after the one-release rollback window they were retained for. There is one access model in the schema now. A row shape carrying a `role` is not a fallback anywhere: an account with no permission set reaches nothing.

The drop file is named `migrate-zz-…` deliberately. `bootstrap-db.mjs` applies `db/schema/*.sql` in plain filename order on every restart, and two files still read the column while it exists — the bundle backfill (`migrate-permissions-2-data.sql`) and the door account's username/email fixups (`migrate-username-1.sql`) — so the drop must sort after both, or a database upgraded straight from a pre-permissions image would lose its roles before they were ever translated into permission sets and every login would be locked out. Both readers are additionally wrapped in an `information_schema` column-existence guard and run through `EXECUTE`, so they are never parsed on a database without the column: a fresh DB built from `00-base.sql`, or any DB the drop has already run on. `src/lib/db-schema-safety.test.ts` asserts both the ordering and the guards.

## Migration bundles

`db/schema/migrate-permissions-2-data.sql` gave every pre-existing account the set that reproduces its old behaviour, once, guarded on "this user's set is still empty":

| Old role | Permissions | `shared` |
|---|---|---|
| `superadmin` | all nine | |
| `admin` | `tickets`, `refunds`, `door` | |
| `tehnika` | `door` | ✓ |
| `partner` | `partner` | |
| `member` | `season_stats` | ✓ |

After the first bootstrap the set is never empty again, so an edit made in `/admin` sticks across restarts. Since #398 the whole file is a no-op unless the column is still there, which only a database upgraded straight from a pre-permissions image can be.
