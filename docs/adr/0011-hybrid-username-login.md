# ADR-0011: Hybrid username login for /admin Users

**Status:** Accepted
**Date:** 2026-06-03

## Context

The Payload `/admin` login field enforces email format, so a non-email login string is rejected with "Please enter a valid email address". This surfaced when a dev `admin`/`admin` account couldn't log in. More broadly, several real accounts don't have a natural mailbox:

- The shared **door account** is a fake email (`tehnika@moreska.eu`, "login string only; no inbox" — [ADR-0004](./0004-email-infrastructure.md)).
- **Partner** logins ([ADR-0008](./0008-partner-sales-channel.md)) are external POS/counter accounts that don't naturally have an inbox.

Email-as-identifier adds friction for these shared/external accounts, and **no email adapter is wired into Payload** (no `email:` in `payload.config.ts`, no `@payloadcms/email-*` dep), so email-based password reset isn't even functional today — reset is "superadmin edits the password in /admin".

## Decision

Adopt **hybrid username login** on the Users collection:

```ts
auth: {
  tokenExpiration: 60 * 60 * 24 * 30,
  loginWithUsername: { allowEmailLogin: true, requireEmail: false },
}
```

- Every user has a unique `username` (the canonical identifier). Users who have an email can **also** log in with it (`allowEmailLogin`).
- **Email is required for the human tiers** (`superadmin`, `admin`) via a `beforeValidate` hook (`src/lib/access/user-email-policy.ts`); it stays optional for `tehnika`/`partner`.
- The shared **door account becomes username `tehnika`**, with its email dropped (it has no inbox).
- Partner logins take a plain username when an admin creates them (e.g. `kaleta`); no code convention needed.

### Schema

`users.username` (varchar, unique) added; `users.email` made nullable. A bootstrap migration (`db/schema/migrate-username-1.sql`) backfills a `username` onto every existing row — `tehnika` for the door account, the email local-part for everyone else — and nulls the door account's email. **Josip keeps his email** (only `role='tehnika'` rows are nulled), so `migrate-roles-2-data.sql`'s superadmin promotion (keyed on his email) is unaffected. Idempotent and guarded per the bootstrap rules in CLAUDE.md. For fresh DBs, the column shape is also in `src/instrumentation.ts` and Payload's `push:true` (dev) reconciles it to the `loginWithUsername` config.

## Alternatives considered

1. **Keep email-only, fix the dev seed** — rejected: doesn't address shared/external accounts' fake-email cosmetic, keeps the format friction.
2. **Username-only, drop email entirely** — rejected: loses email as a future auth/comms channel for the real people who'd benefit, and is the biggest migration.
3. **Hybrid (chosen)** — keeps email for humans (future reset target + contact) while letting shared/external accounts be clean usernames.

## Consequences

- A users schema migration (username column, nullable email).
- [ADR-0004](./0004-email-infrastructure.md)'s "`tehnika@moreska.eu` login string" is **superseded** by username `tehnika`.
- If an email adapter is added later (relates to [ADR-0010](./0010-google-workspace-org-email.md)), `requireEmail`/password-reset can be revisited.

## Verification

Verified live on the dev DB: username `admin` logs in (200) where it was previously rejected; email login still works (`allowEmailLogin`); saving a `superadmin`/`admin` with no email is rejected with a clean 400; a `tehnika` with no email is created (201). The migration ran twice with no errors (idempotent), backfilled every row, and left Josip's email intact.

## Prod cutover (HITL)

On the production DB the bootstrap migration sets the door account to username `tehnika` and nulls its email automatically. Confirm the secretary/door staff know to log in with **`tehnika`** (not the old email string) — see `docs/smoke-test-runbook.md`.
