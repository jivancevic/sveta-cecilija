# ADR-0029: The Zaduženi — a permission that hangs on a row

**Status:** Accepted
**Date:** 2026-09-16
**Ticket:** #658
**Amends:** [ADR-0023](0023-permissions-replace-roles-app-surface.md) (permissions replace roles) and [ADR-0024](0024-moreskant-roster-domain.md) (the roster domain).

## Context

Running an evening's list — answering for the dancers who did not, moving somebody between the armies, handing out the four titles, writing the postava down and locking it — is the `moreska` permission's work, and `moreska` is held by two people: Josip and Branimir. `viewer.voditelj` is not a concept with its own definition; it is literally `can(user, 'moreska')` (`src/lib/app/viewer.ts`).

An evening where neither of them is present therefore has nobody who can record it. The list is kept on paper and typed in days later by somebody who was not there, which is the failure mode ADR-0024 built the roster to end.

The obvious repairs are both wrong:

- **Give a dancer `moreska`.** The permission is global and permanent. A dancer who is trusted to keep one list in August would hold, from that moment on, the right to edit every performance, ring every phone, confirm every postava of the season and drive the MCP server. The grant does not describe what was actually delegated.
- **Add a new permission word** (`list_keeper`, say). Same defect, one notch smaller: still global, still permanent, still unrelated to the evening it was given for. It would also enlarge the vocabulary CLAUDE.md deliberately keeps to one line.

What is actually being delegated is bounded by an evening. It is not a rank, and the person holding it has one on Tuesday and none on Wednesday.

## Decision

**A second predicate, explicitly about a row.**

1. `can()` / `hasAny()` remain the **only** predicates of a permission. Nothing is added to the vocabulary in `src/lib/access/permissions.ts`.
2. A new predicate `keepsList(user, row)` lives in `src/lib/app/list-keeper.ts`, pure and tested without a database. It answers one question — *may this person keep the list of THIS evening* — and it is true for a `moreska` holder on every row, and for a dancer whose Member is in that row's `listKeepers`.
3. `listKeepers` is a `hasMany` relationship to Members on the Shows row, beside `voditeljNote` where the rest of the roster's per-evening fields already live. It carries no audit of who granted it, because only a `moreska` holder can, and there are two of them.
4. The guard shape stays the house shape: the route re-checks a permission through `requirePermission(req, ['moreska','moreskant'])` **and then** checks `keepsList` against the row it loaded. The permission check answers "may this caller be in here at all"; the row check answers "is this their evening". Three routes take it: `POST /api/app/lineup`, `POST /api/app/lineup/confirm`, `POST /api/app/attendance`.
5. **The alarm is not delegated.** `POST /api/app/alarm` keeps `requirePermission(req, 'moreska')` untouched, and with it the two army thresholds that travel in the same sheet. Ringing seventy-six phones is not part of keeping a list, and the two thresholds are a standing decision about the dance rather than a fact about one evening.

The delegation has no expiry. It dies with the evening on its own, and it must survive the evening: a postava is confirmed **after** the night it records, which is exactly when the person who was there needs to unlock it and fix something.

## Consequences

- There are now two kinds of predicate in the codebase, and the difference has to stay legible: `can()` is about a **person**, `keepsList()` is about a **person and a row**. A future reader tidying `keepsList` back into a permission check would silently make one evening's delegation permanent and global. That is what this ADR exists to prevent.
- Every route that gains the row check must load the row before deciding. That is a real cost — the guard can no longer refuse on the session alone — and it is the price of the scope being right.
- A dancer who is deactivated, or who loses their login, simply stops passing the predicate; their `listKeepers` row is left alone. Nothing rewrites a voditelj's record as a side effect of somebody else's change.
- `keepsList` is the first thing in Cecilija that a `moreskant` login can do which a `moreskant` login could not do yesterday. The screen gate does not change: Stanje is already unlocked by `moreskant`, so no new surface is opened — only new controls appear on a surface the dancer already reads.
- The MCP server is untouched. Its tools are the voditelj's and remain gated on `moreska`; the delegation lives only in the app.
