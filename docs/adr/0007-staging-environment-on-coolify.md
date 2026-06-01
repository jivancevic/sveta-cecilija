# ADR-0007: Staging environment on Coolify (rejecting Vercel)

**Status:** Accepted
**Date:** 2026-06-01

## Context

Prod runs on Coolify/Hetzner at moreska.eu (Next.js + Payload CMS + Postgres in one Nixpacks-built container). A Vercel project also exists at sveta-cecilija.vercel.app, dating from the early build when "Vercel preview URL" was the assumed review surface and was documented as such in CLAUDE.md.

That Vercel project has been failing every deploy since 2026-05-25 (commit `cd8e798`, "Security hardening: fail-fast secrets"). `src/payload.config.ts` now throws at module load if `PAYLOAD_SECRET` is missing, and the Vercel project lacks `PAYLOAD_SECRET`, `DATABASE_URL`, and the rest of the Coolify-only env surface. Five days and ~30 broken deploys went unnoticed because nobody was using the URL: the actual workflow is `worktree-* → PR → main → Coolify auto-deploy to prod`. The "review on Vercel preview" step in CLAUDE.md is fiction.

Two pressures forced a decision:

1. **Stripe live cutover is imminent.** Once prod takes real payments, "edit locally → push to main → see what breaks on moreska.eu" stops being acceptable. There needs to be a public URL where changes can be exercised end-to-end (Stripe webhooks against a real domain, Brevo emails from a real sender, QR codes scannable from a phone on mobile data, a stable URL to share with the HGD president for stakeholder review) before they touch buyers.

2. **Vercel is silently broken** and pretending it isn't broken (since deploys fail in a tab nobody opens) creates a documentation-vs-reality gap that misleads future collaborators.

Real reasons a staging environment is wanted, ranked by load:

- Real-domain testing (Stripe webhooks, Brevo deliverability, phone-camera QR scans on mobile data)
- Stakeholder preview (Velebit / HGD members reviewing copy and photos before launch)
- Linux/Coolify/Nixpacks soak, catching environment-drift bugs (macOS-specific deps, lockfile drift, Nixpacks Node-version ceilings) before prod
- Phone testing during development (clicking through a feature on a real phone while typing on the laptop)

Branch-preview-per-PR (Vercel's headline feature) was considered but ranked low: the workflow is already low-friction and per-PR review happens locally.

## Decision

**Run a second Coolify app on the same Hetzner box as prod, serving `dev.moreska.eu` from the `main` branch.** Delete the Vercel project.

Concretely:

- **Topology:** one Hetzner box hosts both apps. Prod and dev each have their own Coolify application pointing at the same GitHub repo, both tracking the `main` branch. Two app processes, two ports, two domains via Traefik.
- **Branch model:** `main` is the single trunk. Dev auto-deploys every push to `main`. Prod has Coolify's auto-deploy *off*; promotion to prod is a manual "Redeploy" click in the Coolify UI. No `dev` branch. No promote-PRs. (The stale `dev` branch on origin should be deleted.)
- **Database:** `sveta_cecilija_staging` on the same Postgres server as prod, distinct credentials, distinct connection string in the dev app's `DATABASE_URL`. Seeded by `scripts/seed-staging.mjs` with a synthetic fixture set that covers awkward shapes (cancelled show, sold-out show, show today, order with no child tickets, refunded order). No prod-data snapshot: GDPR-clean by construction.
- **Stripe:** dev uses `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` test-mode values; prod uses live keys (post-cutover).
- **Email:** dev sets `DEV_EMAIL_OVERRIDE=josip.ivancevic00@gmail.com`. The Brevo transport (`src/lib/email/*`) reads it and rewrites every outbound `to:` to the override address, prepending `[DEV → original@addr]` to the subject. Same Brevo account and sender as prod; the override is the safety. Prod runs with the env var unset.
- **Discoverability:** dev sends `X-Robots-Tag: noindex, nofollow` plus a per-environment `robots.txt` (Disallow: /), a hot-pink "DEV ENVIRONMENT, tickets purchased here are not real" banner gated on `NEXT_PUBLIC_ENV === 'staging'`, and Traefik HTTP Basic Auth scoped to `/admin/*` only. Public site is reachable without credentials so stakeholders and Josip's phone work without password friction; `/admin` requires the second credential set.
- **Phase timing:** dev gets stood up before the Stripe live cutover, so the cutover itself isn't the first time the staging path is exercised.

## Alternatives considered

**Keep using Vercel.** Rejected. Payload CMS holds a long-lived Postgres connection pool, runs schema bootstrap on container start (`scripts/bootstrap-db.mjs`), and serves an admin UI with stateful sessions: none of which match Vercel's serverless-function model cleanly. Even with all env vars wired up, the runtime cold-start cost on every admin click and the awkwardness of a single Postgres pool across ephemeral functions makes it the wrong tool. Plus the env-var sprawl: 8+ secrets that would need to live in *both* Coolify and Vercel, with the manual sync burden and drift risk that implies. The fact that prod is already on Coolify makes a Coolify-Coolify dev/prod pair strictly simpler than a Vercel-Coolify split.

**Fly.io, Render, or Railway as the dev host.** Rejected for the same env-sprawl reason and because they introduce a third stack to learn and bill. Hetzner has the headroom (CX32, hosting prod uses a fraction of it) and Coolify makes a second app a trivial UI action.

**Branch-preview-per-PR via Coolify's preview feature.** Rejected as overkill. Per-PR previews need a fresh DB per preview (or a shared dev DB that gets clobbered by every concurrent branch) plus per-PR DNS, which doesn't pay off for a solo developer whose review pattern is already local. A single long-lived `dev.moreska.eu` covers the actual use cases.

**Resurrect the `dev` git branch as a real two-stage flow.** Rejected. The proposed flow (worktree → PR → `dev` → test → second PR → `main`) doubles the merge count for every change and re-introduces the merge-conflict drag of keeping two long-lived branches in sync. Single-trunk + manual prod redeploy gives the same review surface (dev.moreska.eu) without the branch overhead, and matches what Josip already does.

**Production tag (`production` branch or tag) auto-deployed to prod.** Rejected as over-engineering for a solo project. The "manual Redeploy click" achieves the same outcome (prod ships only when you say so) without needing tag-management discipline.

**Full Basic Auth on the entire dev site.** Rejected. The reasons dev exists include "share URL with Velebit", "test on phone over mobile data", "stakeholder preview", all of which sour fast under a password prompt. `noindex` + a visible DEV banner + admin-only Basic Auth covers the actual risk surface (Google indexing, accidental ticket purchases by drive-by visitors, admin-panel probing) without the friction.

**No staging environment; keep shipping localhost → prod.** Rejected for the post-cutover window. Acceptable while Stripe is in test mode but unacceptable the moment prod takes real money: the cutover itself is the highest-risk change and is exactly when a shakedown environment is most valuable.

## Consequences

- **CLAUDE.md "Git branching" section needs rewriting.** The current text describes a Vercel preview flow that doesn't exist. Replaced inline.
- **Prod-staleness is a real (visible) risk.** Nothing forces the post-merge Redeploy click. Coolify's dashboard makes drift visible (deployed SHA vs latest `main` SHA) so it's spottable, but discipline-required. Hotfixes that skip dev are just "merge to main, immediately Redeploy prod": same flow, no special path.
- **Two Coolify apps means two sets of env vars.** Most vars are the same shape across both (`DATABASE_URL`, Stripe keys, Brevo key, `PAYLOAD_SECRET`); a handful differ (`NEXT_PUBLIC_ENV`, `DEV_EMAIL_OVERRIDE`, Basic Auth credentials). Document the diff in `.env.example` so it's discoverable.
- **The staging DB needs its own bootstrap run.** First deploy will trigger `bootstrap-db.mjs` against the empty `sveta_cecilija_staging` DB; same schema as prod by construction. Schema drift between dev and prod is impossible because both pull from `db/schema/*.sql`.
- **Seed data is synthetic, so "works on dev" doesn't catch all prod-data shape bugs.** Mitigation: the `scripts/seed-staging.mjs` fixtures explicitly cover the awkward shapes (cancelled, sold-out, today, no-child, refunded). Mitigation is not "snapshot prod": that would put real buyer PII in a second place.
- **The Vercel project deletion is one-shot and irreversible.** Acceptable: the project has been broken for a week with zero user impact, confirming it has no users.

## See also

- CLAUDE.md, "Deployment (Coolify / Nixpacks)" section, for build gotchas that apply identically to the dev app
- [ADR-0004](./0004-email-infrastructure.md), Brevo + ImprovMX wiring (dev override piggybacks on this transport)
- [ADR-0006](./0006-three-tier-admin-roles.md), admin role model gated by `/admin/*` Basic Auth on dev
