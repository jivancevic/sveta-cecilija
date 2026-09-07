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
| `moreska` | Moreška roster tools, the voditelj's view (ADR-0024). Reserved; gates nothing yet. |
| `moreskant` | A moreškant's own roster view (ADR-0024). Reserved; gates nothing yet. |
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
- **Field-level locks are what stop self-promotion.** `Users.access.update` allows self-edit, so `permissions`, `shared`, `role` and the `partner` link each carry `access: { read, update, create }` locked to `can(user, 'users')`. A field that fails the predicate is silently dropped from the write, with no error to the caller, so a missing lock fails open and quietly.
- **Shared accounts.** `Users.shared` is the only marker (the door `tehnika` login, the society-wide `member` login). `userUpdateAccess` denies a shared account self-edit, so one volunteer cannot rotate the password and lock the others out. Do not infer "shared" from a permission set.
- **Email is required for a named individual**, decided from the set, not a tier: `users`, `tickets` or `moreska` (`src/lib/access/user-email-policy.ts`). Door, partner and season_stats accounts are username-only.
- **Admin chrome language** defaults from the set too (`src/lib/admin-i18n.ts`): English for a `dev` holder or a door-only account, Croatian otherwise. The user's own `payload-lng` choice always wins.

## The legacy `role` column

`users.role` is retained for exactly one release so a container rollback to the pre-#393 image finds intact data. It is hidden in the admin, optional, defaultless, and read-locked to `users`; nothing reads it for access. #398 drops the column and the enum.

Its constraints were dropped along with the Payload `required`/`defaultValue` (`db/schema/migrate-permissions-3-role-optional.sql`), for two reasons: Payload push emits a bare `role public.enum_users_role` for a non-required defaultless select, so leaving `NOT NULL DEFAULT 'admin'` in `db/schema/` fails the drift gate; and had the DEFAULT stayed, an account created after the deploy would silently inherit `role='admin'` and a rollback would read it as a secretary. A NULL role is read as denied by every old predicate, which is the fail-closed direction.

## Migration bundles

`db/schema/migrate-permissions-2-data.sql` gave every pre-existing account the set that reproduces its old behaviour, once, guarded on "this user's set is still empty":

| Old role | Permissions | `shared` |
|---|---|---|
| `superadmin` | all nine | |
| `admin` | `tickets`, `refunds`, `door` | |
| `tehnika` | `door` | ✓ |
| `partner` | `partner` | |
| `member` | `season_stats` | ✓ |

After the first bootstrap the set is never empty again, so an edit made in `/admin` sticks across restarts.
