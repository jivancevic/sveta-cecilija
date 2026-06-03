# ADR-0012: Container build via multi-stage Dockerfile + Next standalone (off Nixpacks)

**Status:** Accepted
**Date:** 2026-06-03

## Context

Production and staging both build on **Coolify + Nixpacks** with no `Dockerfile`, no `.dockerignore`, and no `nixpacks.toml` — pure Nixpacks auto-detection. A 2026-06-03 audit of the running prod image found:

- **Each app image is ~2.8 GB.** Breakdown (`docker history` + on-disk `du`): `node_modules` 1.1 GB (all deps, including build-only), `/nix` toolchain 399 MB, apt/base/rust-curl layers ~470 MB, full `.next` 114 MB, and a `COPY . /app` of the whole repo (80 MB, no `.dockerignore`). Roughly **1.9 GB of the 2.8 GB is build-time cruft shipped to the runtime container for no reason.**
- `next.config.ts` does **not** set `output: 'standalone'`, so the runtime ships the entire `node_modules` and full `.next` instead of the traced subset Next computes.
- Builds are slow: Nixpacks re-runs `nix-env` (308 MB layer) and reinstalls deps on every build; there is no `package-lock`-keyed install layer to cache.
- Coolify retained 9 stale 2.8 GB image tags (~25 GB) plus 19 GB of build cache; disk was at 60% and climbing unbounded — a future deploy would eventually fail on a full disk mid-season.
- App env vars are passed as **build ARGs**, baking secrets (e.g. `BREVO_API_KEY`) into image-layer metadata (see ADR-0004; the leaked key was flagged for rotation).

CLAUDE.md already documents a string of Nixpacks-specific foot-guns (the `nodejs_24` nix-env failure, the `esbuild` platform-override dance, lockfile skew between macOS and `node:22`). These all stem from Nixpacks owning an opaque, pinned-nixpkgs base we don't control.

## Decision

Move the container build to a **hand-written multi-stage Dockerfile** and switch Coolify's build pack from Nixpacks to Dockerfile.

- Add `output: 'standalone'` to `next.config.ts` so Next emits `.next/standalone` (server + traced `node_modules` subset only).
- Multi-stage `Dockerfile`:
  1. **deps** — `node:22-slim`, `COPY package*.json`, `npm ci` (layer cached on `package-lock.json`; skipped entirely when deps are unchanged).
  2. **build** — `next build` → produces `.next/standalone` + `.next/static`.
  3. **runtime** — `node:22-slim` + only `.next/standalone`, `.next/static`, `public`, and `db/schema` + `scripts/bootstrap-db.mjs`. Runs `node scripts/bootstrap-db.mjs && node server.js`.
- Add a `.dockerignore` (node_modules, .next, .git, assets/, Sveta Cecilija/, docs/, *.ods, .env*) so the build context is minimal.
- **Secrets are runtime env only**, never build ARGs. `next build` only gets the few public/build-time vars it genuinely needs (a throwaway dummy `PAYLOAD_SECRET`/`DATABASE_URL` so the config's module-load fail-fast passes).
- Pin `node:22` to honour the existing `engines` ceiling (Node 22 max, per CLAUDE.md).
- **Verify the new image on `dev.moreska.eu` (staging) first**, then promote to prod via the manual Redeploy gate (ADR-0009).
- Set Coolify image retention to **2** per app (current + one rollback) and prune the stale backlog.

Expected outcome: runtime image **~400–600 MB** (4–6× smaller), far faster cached rebuilds (unchanged-deps builds skip `npm ci`), bounded build cache, secrets out of image history, and retirement of the Nixpacks-specific failure modes.

## Alternatives considered

1. **Tune Nixpacks (add `output:'standalone'` + `nixpacks.toml`).** Rejected as the primary fix: `/nix` (399 MB) and the coarse apt/base layers stay because Nixpacks owns the base; realistic landing ~1.2–1.6 GB and rebuilds stay slow. Keeps every documented Nixpacks foot-gun. A half-measure that ends at this ADR anyway.
2. **Only prune + set image retention, keep Nixpacks images.** Done as immediate disk relief, but treats the symptom — images stay 2.8 GB, builds stay slow. Not a substitute.
3. **Buildpacks (Paketo) / other build pack.** Rejected: trades one opaque base for another; a Dockerfile gives full, reproducible control and is first-class in Coolify.

## Consequences

- **Pro:** ~4–6× smaller images, faster cached builds, predictable bounded cache, secrets no longer in image layers, and a reproducible base we control (kills the Nixpacks gotchas).
- **Pro:** The build is now in-repo and reviewable; CI can build the exact same Dockerfile (ties into the schema/CI work).
- **Con:** We now own a `Dockerfile` (~40 lines) and must keep the runtime stage's native deps correct (Payload, `sharp`, and `pg` — which `bootstrap-db.mjs` needs as a standalone script outside Next's trace). Next standalone tracing can occasionally miss a dynamically-required file — mitigated by the staging-first verification step, which is exactly what staging (ADR-0009) exists for.
- **Con:** One-time Coolify build-pack switch + first-build smoke test.

## Related

- ADR-0009 — Staging environment (where the new image is verified before prod)
- ADR-0004 — Email infrastructure (the Brevo key that was leaking through build ARGs)
- ADR-0013 — Schema management (CI builds the same Dockerfile; the drift gate is a sibling CI job)
- CLAUDE.md — Deployment (Coolify / Nixpacks) gotchas this ADR retires; `engines` Node-22 pin
- Memory: `project_devops_decisions`, `feedback_secrets_build_arg`
