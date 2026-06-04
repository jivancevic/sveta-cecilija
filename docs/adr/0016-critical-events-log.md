# ADR-0016: Critical-events log — a curated DB sink for silent failure seams

**Status:** Accepted
**Date:** 2026-06-04

## Context

Several seams in this app fail **silently**. The one that motivated this ADR: a public contact-form enquiry is persisted to `ContactSubmissions` (so the lead is safe — #220), but the admin notification email is strictly best-effort. On a bad or missing `BREVO_API_KEY` — a real, recurring risk on this project (see memory `project_email_cutover_risks`) — the send throws (or is skipped entirely) and the failure is only ever a `console.error` in container stdout. Nobody is told that an enquiry came in but the org was never emailed. The same shape recurs at other best-effort seams (ticket-confirmation email, refund email, review-email cron).

There is no place in the product where the operator (a non-technical org, with one developer) can see "something that should have happened didn't." Container logs are not a product surface: they're ephemeral, unindexed, and require shell access to the Hetzner box.

We want a **minimal, durable, in-product** way to make these silent failures visible — without standing up log aggregation infrastructure (Sentry, Loki, etc.) weeks before the end-June-2026 cutover, and without turning a best-effort side-effect into something that can fail the primary operation.

## Decision

Add a **curated critical-events log**: a single raw Postgres table the app writes to at known failure seams, plus a minimal read surface for the developer.

- **Table `critical_events`** (`id`, `kind varchar`, `context jsonb`, `created_at timestamptz`), created via the **bootstrap-SQL pattern** (ADR-0013): idempotent `CREATE TABLE IF NOT EXISTS` in `db/schema/app.sql` (+ the fresh-DB mirror in `src/instrumentation.ts`). It is **not** a Payload collection — exactly like `marketing_optouts` (#57). Each row is one event: a timestamp, a short machine `kind`, and an optional JSON `context`.
- **Writer `recordCriticalEvent`** (`src/lib/critical-events/record.ts`): pure + DI (takes a `PoolQuery`), and **best-effort by construction** — it catches and swallows its own errors. This is the load-bearing invariant: a writer can call it unguarded, and a failure to record (table missing, DB down) can **never** cascade into failing the operation that was trying to report a problem.
- **First write-site (#235): the enquiry-notification path.** `submitEnquiry` records `enquiry_notification_failed` when the Brevo send throws, and `enquiry_notification_skipped` when no notifier is wired (the adapter omits the notifier exactly when `BREVO_API_KEY` is missing). The previously-silent case becomes visible; the stored enquiry stays successful in both branches.
- **Read surface: a collapsed, superadmin-only dev strip** on the `/admin` landing. `admin`, `tehnika`, and `partner` never see it — it's a developer/operator diagnostic, not org-facing UI, and English regardless of the admin language toggle. Each section is fail-safe: a read error degrades to a fallback rather than breaking the dashboard.

This is a **curated sink, not log aggregation.** Raw container/stdout logs stay out of scope. Only deliberately-chosen seams write here, so the table stays small and every row is worth a human's attention.

### The dev strip, expanded (#244)

The strip container introduced with the critical-events log is fleshed out (`src/lib/dev-diagnostics/*`, rendered by `SuperadminDevStrip`) with diagnostics no single collection table gives. `gatherDevDiagnostics` is the **single gating chokepoint** — it returns null (and runs **no** queries) for non-superadmins, so the work only happens for a superadmin; each probe inside is independently fail-soft.

- **Environment + DB guard** (`env-info`): classifies prod/staging/dev (staging via `NEXT_PUBLIC_ENV`, else `NODE_ENV`) and parses the connected database name from `DATABASE_URL`. Always-visible banner, prod flagged red — protective against acting on the wrong environment.
- **Data-integrity anomalies + row counts** (`data-integrity`, two round trips): orders-without-tickets, tickets-without-order, past-active shows, and **incomplete refunds**. The issue asked for "refunds stuck pending/failed", but `enum_orders_refund_status` is only `none|refunded` — there is no pending/failed state — so the representable equivalent is recorded instead: orders marked `refunded` whose tickets are still `active` (the refund didn't void its seats).
- **Integration health** (`integration-health` + `stripe-balance`): last online order (≈ last Stripe webhook) and last review-email sent (≈ cron) — honest approximations, since neither integration persists an explicit run timestamp yet; plus the Stripe balance (available/pending EUR) via a 60s-cached, fail-soft fetcher so the strip never makes a live Stripe call per page load.
- **Quick collection links.**

## Alternatives considered

1. **Stand up real error monitoring (Sentry/Loki/etc.) now.** Rejected for timing and fit: new infra + a vendor + cost, introduced weeks before cutover, to surface a handful of known seams to a single developer. Revisit post-season if the seam count grows.
2. **Surface failures as a Payload collection.** Rejected: a Payload collection brings access config, admin-list UI, rels-table columns, and the drift-gate surface for what is a write-mostly diagnostic table. `marketing_optouts` already set the precedent that operational raw tables live outside Payload.
3. **Make the notification failure fail the request (so the user retries).** Rejected: it would turn a stored, safe enquiry into a user-facing error and re-submission storm over a delivery problem the user can do nothing about. The lead is already captured; the gap is operator *visibility*, not data loss.
4. **Leave it as `console.error`.** Rejected: that is the status quo that hid the dropped-leads bug for as long as it existed. Stdout is not a product surface for a non-technical org.

## Consequences

- **Pro:** Silent failures at instrumented seams become visible in-product, with no new infra. The best-effort contract is preserved — recording is itself best-effort.
- **Pro:** Cheap to extend: any future seam calls `recordCriticalEvent({ kind, context })` unguarded. New `kind`s need no schema change (`kind`/`context` are free-form).
- **Pro:** Stays out of the schema drift gate's way — `critical_events` is an extra (non-Payload) object, which the gate allows (ADR-0013).
- **Con:** No alerting — the developer has to *look* at the strip. Acceptable for now (the alternative was nothing); push/email alerting is a later increment if needed.
- **Con:** Free-form `kind`/`context` can drift without a registry. Mitigated by keeping write-sites few and curated; a `kind` enum/registry is deferred until there are enough to warrant it.
- **Con:** Unbounded growth in principle. In practice these are rare events; a retention/prune step is deferred until volume justifies it.

## Related

- ADR-0013 — Bootstrap-SQL schema source of truth + drift gate (how `critical_events` is created; why an extra table is fine)
- #220 — Wire enquiry forms to a real submit (the persistence half; this ADR adds the visibility half)
- #57 / `marketing_optouts` — precedent for an operational raw table outside Payload
- CONTEXT.md — "Critical-events log"
- Memory: `project_email_cutover_risks` (the silent-Brevo-failure risk this addresses)
