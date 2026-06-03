# ADR-0013: Declarative bootstrap SQL as schema source of truth + CI drift gate (defer Payload-native migrations)

**Status:** Accepted
**Date:** 2026-06-03

## Context

Schema is applied by `scripts/bootstrap-db.mjs`, which runs every `db/schema/*.sql` file alphabetically on container start. Payload's `push` is enabled only in dev (`NODE_ENV !== 'production'`); **prod and staging never push**. There is no Payload migration system wired (no `migrations/` dir, no `payload migrate`, `payload_migrations` is empty).

A 2026-06-03 audit found `db/schema/app.sql` had **drifted from every live environment** at the time it was first inspected (on the stale `feat/seed-staging-150` branch, before the per-person/partner epic had merged to `main`):

- It still `CREATE TABLE qr_tokens` — **no environment has `qr_tokens`**. The live `tickets` table is a **renamed `qr_tokens`** (all constraints still named `qr_tokens_*`) plus added columns `type`/`status`/`cancelled_at`/`cancel_reason` and enums `enum_tickets_{type,status,cancel_reason}`, introduced by the per-person epic (ADR-0007) via **dev push**.
- It never created `tickets` or `partners` (ADR-0008) — yet **every environment has them**, as imperative dev-push artifacts.

By the time this ADR was implemented, the partner epic's PRs (#139, #143) had already **fix-forwarded `app.sql` on `main`** — it now renames `qr_tokens`→`tickets` idempotently, creates the ticket enums + per-person columns, creates `partners`, and adds the `partners_id` rels column. So the reconcile portion was largely already landed on `main`; the *recurrence* is what remained unguarded.

Consequence had it not been caught: **the repo's declared schema could not reproduce any environment.** A fresh prod DB (DR rebuild, the planned `postgres`→`sveta_cecilija` rename, or a clean-slate cutover reset) built from `db/schema/` would have `qr_tokens` (wrong) and lack `tickets`/`partners` (the order-creation path breaks), with no push to self-heal. This is a cutover and disaster-recovery landmine, discovered weeks before the end-June-2026 cutover.

## Decision

Keep `db/schema/*.sql` (run by `bootstrap-db.mjs`) as the **declarative source of truth**, keep it fixed-forward to match reality, and add a CI gate that prevents recurrence. **Defer** adopting Payload-native migrations until after the season.

- **Confirm `app.sql` reconciliation** (largely landed via the partner epic): rename `qr_tokens` → `tickets` if present else `CREATE TABLE IF NOT EXISTS tickets …`; enums `enum_tickets_{type,status,cancel_reason}` + columns; `CREATE TABLE IF NOT EXISTS partners …` (+ sequence); stop creating `qr_tokens`. Respect the existing enum-migration split rule (CLAUDE.md): `ALTER TYPE … ADD VALUE` cannot share a file/transaction with statements that use the value.
- **CI drift gate** (new GitHub Actions job): spin up a throwaway Postgres, run `bootstrap-db.mjs`, then assert the resulting schema matches Payload's expected schema (boot Payload in a temp dev DB with push, `pg_dump --schema-only` both, normalise, diff). Fail the PR on any divergence so `app.sql` can never silently drift from the Payload collections again.
- **Prove reproducibility now:** since all DB data is disposable except show dates (which live in `seed-shows.sql`, matching `docs/RASPORED ZA PRINT 2026.ods`), rebuild staging and the renamed prod DB from `db/schema/` alone. If the app comes up clean, reproducibility is demonstrated, not assumed.
- **Post-season:** open an issue to evaluate moving to Payload-native migrations (`payload migrate:create`/`migrate`) as the long-term mechanism.

## Alternatives considered

1. **Adopt Payload-native migrations now.** Rejected for timing: it swaps the deploy flow weeks before cutover, retires the working bootstrap mechanism, and Payload's generated migrations still carry the enum-ordering edges we'd hand-edit. Right long-term, wrong moment. Captured as a post-season issue.
2. **Enable Payload `push` in prod.** Rejected: Payload disables it in production for good reason — schema diffing can drop columns/data without review. Unacceptable for a live ticketing DB.
3. **Leave `app.sql` as-is, manage schema by hand on the box.** Rejected: that is exactly the imperative drift that created this problem; not reproducible, not reviewable.

## Consequences

- **Pro:** The repo can rebuild any environment; DR, the prod DB rename, and clean-slate cutover all become safe.
- **Pro:** The CI drift gate makes "Payload collection changed but `app.sql` didn't" a red build instead of a latent prod landmine.
- **Pro:** No deploy-flow change before cutover; minimal, reversible.
- **Con:** `app.sql` and the Payload collections must be kept in step by hand — but the CI gate enforces it, turning a silent failure into a loud one.
- **Con:** Defers the "proper" migration system; revisited post-season.

## Related

- ADR-0007 — Per-person tickets (the `qr_tokens`→`tickets` rename that drifted)
- ADR-0008 — Partner sales channel (the `partners` table that drifted)
- ADR-0009 — Staging environment (where rebuild-from-source is verified first)
- ADR-0012 — Container build (CI builds the same Dockerfile; the drift gate is a sibling CI job)
- CLAUDE.md — Schema management; enum-migration ordering + file-split rule; `db/schema/README.md` contract
- Memory: `project_schema_drift_appsql`, `project_devops_decisions`, `project_show_schedule_truth`
