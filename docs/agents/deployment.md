# Deployment (Coolify on Hetzner)

`main` auto-deploys. Coolify pulls the commit, runs Nixpacks → Docker build → `npm ci --production` → `next build` → `npm start` (which is `node scripts/bootstrap-db.mjs && next start`). Build server is `hetzner-ubuntu-4gb-fsn1-1`.

## Pipeline cheat sheet

| Stage | Common failure | Where it lands |
|---|---|---|
| `nix-env -if .nixpacks/nixpkgs-*.nix` | `undefined variable 'nodejs_24'` | Nixpacks's pinned nixpkgs only has up to `nodejs_22`. Don't set `NIXPACKS_NODE_VERSION` higher than 22; pin via `engines` in `package.json` instead. |
| `npm ci --production` | `npm ci can only install packages when your package.json and package-lock.json are in sync` | Lockfile drift from a partial `npm install <pkg> --save` on macOS. Regenerate: `rm -rf node_modules package-lock.json && npm install`. |
| `npm ci --production` | `EBADPLATFORM @esbuild/<aix-ppc64\|...>` | Nested esbuild from a devDep (e.g. vitest) left a platform binary without `optional: true` in the lockfile. Fix via `overrides` (see below) or remove the offending devDep. |
| `next build` | `relation "shows" does not exist`, `column "X" does not exist` | Schema drift — bootstrap script didn't run or `db/schema/app.sql` is missing the column. See `db-bootstrap.md`. |
| `next start` runtime | `digest: <number>` in browser, no message | Server Components render error. Production hides the message; grep Coolify container logs for the digest to find the real one. |

## Always-on rules

- **Verify `npm ci --production` in a Linux container before pushing build-affecting changes:**
  ```sh
  docker run --rm -v "$PWD":/app -w /app node:22 sh -c "npm ci --production"
  ```
  Exit 0 = will pass on Coolify. macOS-only validation isn't enough.
- **Pin Node in `package.json` `engines`.** Source of truth lives in the repo, not Coolify env. Currently `">=22 <23"`.
- **Keep `overrides.esbuild` until vitest's nested esbuild stops triggering EBADPLATFORM.** Pin to the version closest to what most direct deps want (currently `^0.25.0`).
- **Don't add ARG/ENV for secrets in any future Dockerfile.** Coolify warns about this (`SecretsUsedInArgOrEnv`); use runtime env vars instead.

## Triaging a failed deploy

1. **Read `docs/logs.txt` (where the user pastes Coolify output) or fetch from Coolify directly.** Look for the first `ERROR:` line — Docker's BuildKit shows errors in reverse-stack order, so scroll *up* from that to find the source.
2. **Identify the stage** from the `[stage-0  N/11]` marker. `4/11` = nix-env; `7/11` = npm ci; later = build/start.
3. **Reproduce locally** in a `node:22` container (the same image Coolify uses). Most failures reproduce there — the few that don't are env-var-shaped (missing `DATABASE_URL` etc.).
4. **Server Components 500s in production** show only a `digest` string in the browser console — the real message is hidden. Grep Coolify logs for the digest or the error class name to find the actual exception.

## Env vars that must be set in Coolify

- `DATABASE_URL` — Postgres connection string. App service can't reach `localhost`; use the Postgres service name (e.g. `postgres://moreska:pass@postgres:5432/moreska`).
- `PAYLOAD_SECRET` — any 32+ char random string.
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard.
- `BREVO_API_KEY` — for transactional email (issue #6).
- `NEXT_PUBLIC_BASE_URL` — `https://moreska.eu` in prod.

Setting/changing any of these requires a redeploy — Coolify env doesn't hot-reload into the running container.

## What runs at startup

```sh
node scripts/bootstrap-db.mjs   # idempotent SQL from db/schema/*.sql
next start                      # the actual app
```

If bootstrap fails, the container exits — `next start` never runs. Logs will show `[bootstrap-db] failed: <reason>`. The script also handles `DATABASE_URL not set` gracefully (logs and skips, so the app can start in degraded mode for debugging).
