# ADR-0009: Staging environment on Coolify (dev.moreska.eu)

**Status:** Accepted
**Date:** 2026-06-01

## Context

The project deploys to production via **Coolify + Nixpacks on Hetzner** (`npm ci --omit=dev` → `bootstrap-db.mjs` → `next start`), with PostgreSQL on the same box. CLAUDE.md documents a string of deploy-time failure modes that are specific to that runtime: the Node 22 ceiling, `npm ci` lockfile skew between macOS and `node:22`, `esbuild` platform overrides, enum-migration ordering, and `bootstrap-db.mjs` behaviour on restart. None of these reproduce on a developer laptop or in `vitest` — they only surface in a prod-like Linux container during an actual deploy.

Until now there was no environment that mirrored production *before* main reached production. Two consequences bit us:

1. **The only "preview" was Vercel**, which does not match the prod runtime (no Coolify, no Nixpacks, no bootstrap script, different Postgres wiring). A Vercel green build said nothing about whether Coolify would deploy. Worse, the Vercel project at `sveta-cecilija.vercel.app` had been **failing every deploy since 2026-05-25** (fail-fast `PAYLOAD_SECRET` during `next build`) and nobody noticed for five days and ~30 broken deploys, because the URL has no users. A preview that can rot unnoticed is worse than no preview.

2. **Production auto-deployed from `main`.** Any merge went straight to the live ticketing site with no prod-like gate in between — during peak season this is the riskiest possible posture for a system taking real money.

We need a staging environment that is the *same* runtime as prod, that emails cannot leak from, that search engines cannot index, and that can be seeded with awkward-shaped data without copying real buyer PII.

## Decision

Stand up **`dev.moreska.eu`** as a second Coolify application on the same Hetzner box, and flip the deploy posture so prod is gated.

### Topology
- New Coolify app pointing at this repo, tracking the **`main`** branch, **auto-deploy ON**. Every merge to main lands on `dev.moreska.eu` automatically, in the exact Coolify/Nixpacks runtime prod uses.
- **Production auto-deploy turned OFF** — production ships only by a **manual Redeploy** in Coolify, after staging has proven the build. This is the core posture change: main is continuously validated in a prod-like environment, but going live is a deliberate human action.
- A separate database `sveta_cecilija_staging` with its own credentials, distinct from both `sveta_cecilija` (prod) and `sveta_cecilija_dev` (local). The three-distinct-names rule (CLAUDE.md) extends to staging so a misconfigured `DATABASE_URL` can never cross environments. `bootstrap-db.mjs` populates the staging schema on first deploy as usual.

### Isolation guarantees
- **Email cannot leak.** Brevo has a single API key shared with prod, so staging must neutralise outbound mail at the transport layer. A `DEV_EMAIL_OVERRIDE` env var, read as close to the Brevo call as possible, rewrites every outgoing `to` to the override address and prepends `[DEV → original@addr]` to the subject. Unset in prod → no-op. This covers every mail path (ticket confirmation, contact form, review email, future templates) by construction. (Issue: "Add DEV_EMAIL_OVERRIDE to Brevo email transport".)
- **Not indexable.** A `noindex` header / blanket `robots.txt` disallow, plus **HTTP Basic Auth on `/admin`** via a Traefik label. Staging must never compete with prod in search or expose an open admin.
- **Test-mode payments.** Stripe **test** keys, with a dedicated `https://dev.moreska.eu/api/stripe/webhook` endpoint registered in the Stripe test dashboard; its signing secret goes into the staging app's `STRIPE_WEBHOOK_SECRET`. No live charge can originate from staging.
- SSL is provisioned automatically by Traefik on first request, same as prod.

### Synthetic data, not a prod snapshot
A manual, idempotent `scripts/seed-staging.mjs` (modelled on the bootstrap pattern, guarded to refuse any `DATABASE_URL` whose name lacks `staging`) seeds **deliberately awkward fixtures** rather than copying prod: a cancelled show, a sold-out show, a show happening today (for door-flow testing), an adults-only order, a refunded order, and QR tokens for each so `/scan/[token]` is testable end to end. Buyer names/emails and Stripe PI ids are obviously fake (`test-a@example.invalid`, `pi_TEST_seed_<n>`). It is **not** wired into any auto-deploy step — it is an on-demand "reset my staging data" tool. (Issue: "Write scripts/seed-staging.mjs with awkward-shape fixtures".)

### Retire Vercel
Delete the `sveta-cecilija` Vercel project, remove its GitHub webhook and integration, and strip remaining `vercel` references from docs. It deploys nothing prod-like, has no users, and its silent rot is the cautionary tale that motivated this ADR. (Issue: "Delete Vercel project + remove Vercel references from docs".)

## Alternatives considered

1. **Keep Vercel as the preview.** Rejected: it does not match the prod runtime (the whole point is to catch Coolify/Nixpacks/bootstrap failures), and it had already demonstrated it can fail silently for a week.
2. **No staging — keep auto-deploying main to prod.** Rejected: unacceptable risk for a live payment system in peak season; deploy-time failures are exactly the class `vitest` and local dev never catch.
3. **Branch-preview environments (one ephemeral env per PR).** Rejected for now: Coolify per-PR previews add orchestration and DB-provisioning overhead disproportionate to a solo developer with a low PR rate. One long-lived staging tracking main is enough; revisit if PR volume grows.
4. **Snapshot prod data into staging.** Rejected: copies real buyer PII into a less-protected environment for no benefit. Synthetic awkward-shape fixtures exercise the row shapes that matter without the privacy exposure.
5. **A second Brevo account / sender for staging instead of an override.** Rejected: more accounts to manage and reputation to warm; the transport-level `to`-rewrite is simpler and fails safe (any un-overridden path still lands in the dev inbox, not a buyer's).
6. **Share the prod or `_dev` database.** Rejected: violates the distinct-DB-name safety rule; a staging bug must never be able to touch prod rows or local dev data.

## Consequences

- **Pro:** Every merge to main is continuously validated in the exact runtime prod uses; Coolify/Nixpacks/bootstrap regressions surface on staging, not on the live site.
- **Pro:** Production becomes a deliberate, gated manual deploy — the safe posture for peak season.
- **Pro:** Email, indexing, and payments are isolated by construction; no buyer can receive a staging email and no live charge can originate from staging.
- **Pro:** Deleting Vercel removes a rotting, misleading signal and the GitHub deploy noise it generated.
- **Con:** A second Coolify app + database to maintain on the same box (modest resource overhead; CX32-class host has headroom).
- **Con:** The single shared Brevo key means email isolation depends entirely on `DEV_EMAIL_OVERRIDE` being set on staging — a missing env var would leak. Mitigated by reading it at the transport boundary and treating "unset on a `*staging*` DB" as a deploy smell to check.
- **Con:** Manual prod deploy adds a human step to shipping; acceptable, and the intended trade-off.
- **Con:** Staging fixtures must be kept roughly in step with schema changes (e.g. the per-person `tickets` migration in ADR-0007) or `seed-staging.mjs` drifts.

## Related

- Issues #149 (Coolify app + DNS + staging DB), #152 (DEV_EMAIL_OVERRIDE), #150 (seed-staging.mjs), #151 (delete Vercel) — the implementation slices.
- ADR-0004 — Email infrastructure (the Brevo sender identities the override wraps)
- ADR-0006 — Three-tier admin roles (the `/admin` surface Basic Auth protects on staging)
- CLAUDE.md — Deployment (Coolify / Nixpacks) gotchas; distinct DB names; `bootstrap-db.mjs` behaviour
