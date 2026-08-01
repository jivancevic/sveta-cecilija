# ADR-0022: Member season dashboard (fifth role, shared read-only login)

**Status:** Accepted
**Date:** 2026-08-01

## Context

Society members repeatedly ask the same question — *how are we doing this season?* — and today the only answer path is asking the secretary or the developer, who reads it off the `/admin` dashboard. Members are the society; the number is about work they perform. The brief: give them a self-serve view of **how many tickets the season has moved**, with no money and no ability to change anything.

Three existing decisions collide with that brief and have to be resolved rather than worked around:

- **[ADR-0019](./0019-comp-ticket-channel-members.md) states a member never authenticates.** `Members` is deliberately a *attribution* table — name, active, note — with no email and no login, so comps and promo codes can be credited to a person without provisioning accounts for dozens of people.
- **[ADR-0006](./0006-three-tier-admin-roles.md) fixes the role vocabulary** (`superadmin | admin | tehnika`, later `partner`), and `CLAUDE.md` carries it as a hard rule.
- **Prices are fixed and public (€20 adult, €10 child).** "No financial figures" is therefore not literally achievable: any ticket count *is* revenue divided by a constant. The only real variable is how precisely the euro figure can be reconstructed.

The last point was put to the requester explicitly and the tradeoff was accepted; this ADR records that as a deliberate choice, not an oversight.

## Decision

**A fifth role `member`, on a single shared read-only login, landing on its own branch of the existing `/admin` dashboard.**

**Access: one shared account, not per-member logins.** A new role `member` in `Users`, bound to a single shared account (username `clanovi`, no email — the ADR-0011 username-login path already supports this, as it does for `tehnika`). No `Members` relationship: the account is not a person, so it is not tied to a `Members` row. ADR-0019's "a member never authenticates" **remains true of the `Members` collection** — no member record gains credentials, no login is provisioned per person, and the attribution model is untouched. What changes is narrower: *the society's membership, collectively, gets one read-only door into the admin.*

**Location: a fifth branch of `AdminDashboardView`, not a new surface.** Login, session, Croatian i18n, and the role-branch pattern from [ADR-0015](./0015-role-shaped-admin-dashboards.md) all come for free. The sidebar is empty for `member` with **no collection changes**: every collection's `admin.hidden` is already an allow-list predicate (`isAdminTier` / `isAuthed`), and `member` is in neither. Likewise, no collection grants `member` read access, so the Payload REST/GraphQL surface stays closed; the dashboard reads its data server-side through the local API (`overrideAccess: true`), as the other dashboards do.

**Content: the full breakdown, capacity included.** The view carries, for the current season:

- a headline **"izdano ulaznica"** (tickets issued) figure,
- **per performance**: date, venue, tickets, and **capacity fill** (issued vs `VENUE_CAPACITY`),
- **season capacity fill** as a percentage,
- an **adult / child** split,
- a **channel** split: online / box office / partner / comp.

**The headline counts comps, and is therefore labelled "issued", not "sold".** This deliberately differs from the admin dashboard, where comps sit *outside* sales and outside every money total. The member question is "how many people did we play to", not "what did we bill", so goodwill tickets belong in the total. The word choice carries the difference, and the channel split keeps comps visible as their own slice so nobody reads the headline as revenue.

**Cancelled and refunded tickets are excluded and self-heal**, via the same active-ticket count the seat model uses (`t.status = 'active'`). Box-office sales have no ticket rows — they are the `shows.inPersonSold` counter (with `legacyReserved` folded in) — so they are counted in the totals and the channel split, but the **adult/child split is explicitly marked "box office excluded"** because that counter carries no ticket type.

**"Season" gets a real definition, for the first time.** Season = **performances whose date falls in the current calendar year**. Every existing helper counts the whole table, which is accidentally correct only because the database holds one season; that silently becomes a two-season sum in January 2027. The definition lands as a small shared helper rather than a schema field: performances run May–September, so no season straddles New Year, and no one has to remember to set a field on every show.

**The shared account cannot change itself.** `member` is excluded from the `selfOrSuperadmin` update on `Users` — no password, email, or username change. Otherwise any one member could rotate the shared password and lock out the entire membership *and* the developer. The account page offers logout and the language selector only. Password rotation is a superadmin act.

**Language:** Croatian, which `defaultLanguageForRole` already returns for any role that is not `superadmin`/`tehnika`. The native Payload selector still offers English.

**The numbers are treated as semi-public.** A password shared across the membership will, in practice, circulate freely; combined with the full per-performance breakdown, sales levels are one screenshot from being public, including to the rival society at moreska.hr. This was put to the requester and accepted. The mitigation is not secrecy but revocability: one password, rotatable between seasons by the superadmin.

## Alternatives considered

**Per-member logins tied to `Members` rows.** Rejected on operations, not on principle. It is the only design that makes a leak individually revocable and would preserve a real per-person identity — but the sole developer would own dozens of password resets for a read-only counter. Revisit only if the view ever grows a per-member figure (e.g. "your promo code sold N"), where identity would start to earn its cost.

**A public or token-guarded page with no login at all.** Rejected. Zero administration, but a leaked URL is unrevocable-by-password and hands the competitor a permanent feed. A login costs nothing extra here because Payload auth already exists.

**No dashboard; a periodic push (email or the members' group).** Rejected as not self-serve — the requester asked for something members can open when curious, and a push re-creates the "ask someone" loop it was meant to remove.

**A single headline number with no breakdown.** Rejected by the requester. It minimizes leakage but is the version members would immediately outgrow ("and per performance?"), returning us to this decision.

**Keeping comps out of the headline, mirroring the admin dashboard.** Rejected. Consistency between dashboards is worth less than answering the member's actual question; the "issued" label plus a visible comp slice makes the difference legible.

**An explicit `season` field on `Shows`.** Rejected as premature. It survives edge cases the calendar-year rule does not (a December performance belonging to the next season), at the cost of a migration and a field that must be set correctly on every show forever. The calendar-year helper is a single seam to change if that edge case ever becomes real.

**A separate route outside `/admin` (the `/scan` pattern).** Rejected. Full control of the chrome, but it means a second login screen and a second guard for a page that shows six numbers.

## Consequences

- **The `CLAUDE.md` hard rule on roles changes.** The list becomes `superadmin | admin | tehnika | partner | member`, still read exclusively from `src/lib/access/roles.ts`. Every predicate there is an allow-list, so `member` defaults to *denied* everywhere — the safe direction — but each predicate must still be reviewed once against the new value rather than assumed correct.
- **ADR-0019's "a member never authenticates" is narrowed, not reversed.** It continues to hold for the `Members` collection and the attribution model. Any future work that tries to link the shared account to a `Members` row is a new decision, not an implementation detail.
- **A revenue figure is derivable from this page**, to within the box-office adult/child ambiguity. Accepted deliberately. It also means the page can never be described internally as "no financial information".
- **Capacity and remaining seats are exposed** to a semi-public audience: a viewer can see which performances filled and which did not. Accepted with the same reasoning.
- **The season definition is new shared vocabulary.** Once the helper exists, the other dashboards' whole-table counts become visibly wrong-by-omission in 2027 and should migrate to it. Doing so changes the admin dashboard's historical totals, so it is a separate, deliberate change, not a drive-by.
- **One more consumer of the admin HR/EN string map** ([ADR-0015](./0015-role-shaped-admin-dashboards.md) already flags this as a surface that drifts if neglected).
- **No audit of member access.** Nobody knows who looked or when — an accepted consequence of the shared account, and the reason a leak can only be answered by rotating the password.
- **A schema change is required after all**, small but easy to get wrong: `enum_users_role` is a real Postgres enum (`db/schema/00-base.sql`), and its `CREATE TYPE` is wrapped in a `duplicate_object`-swallowing `DO` block — so on any existing database it will **not** pick up a new value. Per [ADR-0013](./0013-schema-management-bootstrap-sql-drift-gate.md) this needs **both** an `ALTER TYPE … ADD VALUE 'member'` migration file *and* the value added to `00-base.sql` for fresh databases. Bootstrap applies `migrate-*.sql` in **alphabetical** order, so the filename must sort after anything it depends on, and the value must be added in a statement separate from its first use.
