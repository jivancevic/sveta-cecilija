# ADR-0023: Permissions replace roles; `/app` becomes the primary staff surface

**Status:** Accepted
**Date:** 2026-09-07

## Context

The Moreškant roster app ([ADR-0024](./0024-moreskant-roster-domain.md)) adds two new kinds of user (voditelj, moreškant) to a system whose access model is a single `role` enum (`superadmin | admin | tehnika | partner | member`, ADR-0006/0008/0022). The real user population no longer fits one axis: Branimir is a ticket admin *and* a voditelj *and* dances; Tatjana is a ticket admin who must not see roster data; Josip is all of it. Every "sixth role" spelling (`admin-voditelj`) is combinatorics, a sign the tier model stopped describing reality.

At the same time the `/admin` surface is Payload's admin UI with 39 custom React components (about 7,400 lines) bolted into it. The custom code is where all the value is; the Payload shell is where the friction is (hand-maintained importMap, CSRF/Origin gate on cookies, string-path component refs, limited UX). Payload still provides auth, the local API at 45 call sites, and stock CRUD for 11 collections. The schema is owned by `db/schema/*.sql` (ADR-0013), not by Payload.

## Decision

**1. A user holds a set of permissions; the role enum is removed.** `Users.permissions` is a multi-select over `users | tickets | refunds | door | partner | season_stats | moreska | moreskant | dev`. All checks go through `can(user, permission)` in `src/lib/access/roles.ts`; no code compares a role string. `partner` requires a Partner link, `moreskant` requires a Member link (`Users.member`). "Superadmin" survives only as shorthand for "every permission". The old roles map to fixed permission bundles at migration time (admin → tickets+refunds+door; tehnika → door; partner → partner; member → season_stats; superadmin → all).

This was chosen **over** keeping `role` as a coarse tier plus a small `capabilities` list for exceptions. The hybrid was the cheaper path and was recommended; the requester chose the clean model with the argument that the user base is small and the sets genuinely differ per person. Recorded as a deliberate choice against the cheaper option.

**2. The migration is its own first phase.** `role` sits in a Postgres enum, 19 field-level access checks, sidebar `hidden` predicates, dashboard branching, and a `CLAUDE.md` hard rule. It touches the live ticketing system that takes real Stripe payments. It therefore ships as a separate PR with tests before any roster screen, never interleaved with new features. Per ADR-0013 the enum drop needs both a `migrate-*.sql` file (sorted after its dependencies) and a `00-base.sql` update.

**3. `/app` is the primary staff surface; Payload admin becomes backoffice.** A new mobile-first route group, brand CSS, sharing the Payload auth cookie, hosts the roster app and, screen by screen as they are touched, the existing custom dashboards (stats, partner sell, comp issue, bulk create). Payload keeps auth, the local API, and stock CRUD for rare raw edits. Nobody is expected to use `/admin` daily.

This was chosen over ripping Payload out (rewrite of auth plus 45 call sites, weeks of work, zero new features, regression risk mid-season) and over adding more views into the Payload shell (more of the friction that prompted the question). If `/app` covers everything after a season or two, retiring `/admin` becomes a small decision instead of a large one.

## Consequences

- `CLAUDE.md` hard rule on roles is rewritten to name permissions and `can()`.
- ADR-0022's shared `member` login stays, now as a user with only `season_stats`.
- Field-level access on `Users.permissions` is restricted to holders of `users`; a user without it cannot grant themselves anything.
- The PWA at `/app` relies on Payload cookie auth being accepted for same-site navigations; the CSRF/Origin gate documented in `docs/agents/payload-admin.md` applies unchanged.
