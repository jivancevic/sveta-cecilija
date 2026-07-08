# Deployment (Coolify on Hetzner)

Two Coolify apps on one Hetzner box both track `main` ([ADR-0009](../adr/0009-staging-environment-on-coolify.md)): **`dev.moreska.eu` auto-deploys** every push to `main`; **`moreska.eu` (prod) has auto-deploy OFF** — promotion is a manual "Redeploy" click in the Coolify UI after testing the same commit on dev. Hotfixes are "merge to main, immediately Redeploy prod"; no special path. No `dev` git branch (single trunk). Don't use Vercel — Payload's long-lived Postgres pool + bootstrap-on-start fights serverless.

> **Redeploy the *right* app.** That same Coolify instance also hosts an unrelated **`korcula-stays`** project (e.g. `korcula-pms`) — easy to Redeploy by mistake. Prod moreska.eu is **project `moreska-eu` → production → app `sveta-cecilija:main-zek88q652dijih0ywodgffux`** (domains `moreska.eu` + `www.moreska.eu`, Build Pack: Dockerfile). Before clicking Redeploy, confirm the breadcrumb reads `moreska-eu › production › sveta-cecilija…`; after, confirm the deploy log line `Importing jivancevic/sveta-cecilija:main (commit sha …)` matches the commit you just merged. The Coolify UI is reached via an SSH tunnel to `localhost:8000`; if it shows an error page, the tunnel dropped (`curl localhost:8000` → `000`) — re-establish it first.

Each deploy: Coolify pulls the commit and runs `docker build` against the repo-root **`Dockerfile`** ([ADR-0012](../adr/0012-container-build-dockerfile-standalone.md)) — Nixpacks was dropped in #193. The multi-stage build is `deps` (`npm ci`, cached on the lockfile) → `build` (`next build` → `.next/standalone`) → `runtime` (a slim `node:22-slim` image holding only the standalone output plus the bits `bootstrap-db.mjs` needs). The container's `CMD` is `node scripts/bootstrap-db.mjs && node server.js` (schema bootstrap, then the standalone server — there is no `npm start` in the image).

## Database topology

One shared Postgres container (`postgres:18-alpine`, container id `tcrw531gbwikko09bvl9ssaz`, superuser `postgres`) holds both prod and staging DBs; identify it by env, not name. Verified on the box 2026-06-02:

- **Local dev** → `sveta_cecilija_dev`
- **Production** → `sveta_cecilija` (renamed from the default `postgres` DB in #195; confirmed 2026-07-08 via the prod app container's `DATABASE_URL`). The default `postgres` DB is now empty — connecting to it gives `relation "…" does not exist`. Gold-standard check: read the prod app's `DATABASE_URL` (`docker exec <app> printenv DATABASE_URL`).
- **Staging** → `sveta_cecilija_staging` (owner `staging_user`)

Coolify runs its *own* internal Postgres in a separate `coolify-db` container — never touch it.

## Pipeline cheat sheet

| Stage | Common failure | Where it lands |
|---|---|---|
| `deps` (`npm ci`) | `npm ci can only install packages when your package.json and package-lock.json are in sync` | Lockfile drift from a partial `npm install <pkg> --save` on macOS. Regenerate: `rm -rf node_modules package-lock.json && npm install`. |
| `deps` (`npm ci`) | `EBADPLATFORM @esbuild/<aix-ppc64\|...>` | Nested esbuild from a devDep (e.g. vitest) left a platform binary without `optional: true` in the lockfile. Fix via `overrides` (see below) or remove the offending devDep. |
| `next build` | `relation "shows" does not exist`, `column "X" does not exist` | Schema drift — bootstrap script didn't run or `db/schema/app.sql` is missing the column. See `db-bootstrap.md`. |
| `runtime` (`node server.js`) | `digest: <number>` in browser, no message | Server Components render error. Production hides the message; grep Coolify container logs for the digest to find the real one. |

## Always-on rules

- **Reproduce the real deploy build locally before pushing build-affecting changes** — run the same `Dockerfile` Coolify runs:
  ```sh
  docker build -t moreska-build-check .
  ```
  Exit 0 = will pass on Coolify. macOS-only `next build` validation isn't enough; the multi-stage build runs on `node:22-slim` (glibc) and surfaces platform/trace issues a local build won't.
- **Pin Node in `package.json` `engines`.** Source of truth lives in the repo, not Coolify env. Currently `">=22 <23"`; the `Dockerfile` bases all stages on `node:22-slim` to match.
- **Keep `overrides.esbuild` until vitest's nested esbuild stops triggering EBADPLATFORM.** Pin to the version closest to what most direct deps want (currently `^0.25.0`).
- **Never add ARG/ENV for real secrets in the `Dockerfile`.** Coolify warns about this (`SecretsUsedInArgOrEnv`); use runtime env vars instead. The only build-time `ENV`s are the *dummy throwaway* `PAYLOAD_SECRET`/`DATABASE_URL` that `next build` needs to evaluate `payload.config.ts` — never real values.
- **A runtime dependency read dynamically (not statically imported) is missed by Next's standalone trace and must be COPYed explicitly in the `runtime` stage.** This already bit `pg` (bootstrap script) and the ticket-PDF fonts/logo (#216) — see the comments in the `Dockerfile`.

## Triaging a failed deploy

1. **Read `docs/logs.txt` (where the user pastes Coolify output) or fetch from Coolify directly.** Look for the first `ERROR:` line — Docker's BuildKit shows errors in reverse-stack order, so scroll *up* from that to find the source.
2. **Identify the stage** from the BuildKit `[stage N/M]` / stage-name marker: `deps` = `npm ci` (lockfile/platform issues); `build` = `next build` (schema, type, or trace issues); `runtime` = image assembly / a missing dynamically-read file.
3. **Reproduce locally** with `docker build .` (same `Dockerfile`, same `node:22-slim` base Coolify uses). Most failures reproduce there — the few that don't are env-var-shaped (missing `DATABASE_URL` etc.).
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
node server.js                  # the actual app (Next.js standalone entry point)
```

This is the container `CMD`. If bootstrap fails, the container exits — `server.js` never runs. Logs will show `[bootstrap-db] failed: <reason>`. The script also handles `DATABASE_URL not set` gracefully (logs and skips, so the app can start in degraded mode for debugging).

## Deploy triggers

Both apps connect to the repo via the same Coolify **GitHub App** (no per-repo deploy webhook — its hook lives at the App/installation level, so `gh api repos/.../hooks` is empty by design). Whether a push to `main` deploys is governed by each app's **Automatic Deployment** toggle: **staging (`dev.moreska.eu`) = ON**, **prod (`moreska.eu`) = OFF**. If staging stops auto-deploying, check that per-app toggle first.

### If auto-deploy isn't firing (two non-obvious gotchas, both cost real time in #226)

1. **Inbound firewall must allow GitHub → Coolify webhook.** The GitHub App's `push` webhook is *inbound* to Coolify at `http://<box-ip>:8000`; manual **Redeploy** is *outbound* (the box clones GitHub), so Redeploy working tells you nothing about the webhook. If GitHub App → **Recent Deliveries** show `push` events failing with **"failed to connect to host"** (and `curl http://<box-ip>:8000` returns `code=000`), TCP 8000 is firewalled. Fix: add an **inbound rule in the Hetzner Cloud Firewall** — TCP, port **8000**, source = the GitHub `hooks` ranges from `https://api.github.com/meta` (re-check, they drift), **never `0.0.0.0/0`** (that exposes the Coolify dashboard). In the Hetzner rule form the CIDRs go in the **Source IPs** field (the "Any IPv4 / Any IPv6" box, type each + Enter), and `8000` goes in the **Port** field — a CIDR in the Port field errors "End port have to be higher than the start port". Host `ufw` was not a second blocker here, but check `sudo ufw status` if the cloud-firewall rule alone doesn't fix it.

2. **Coolify waits for required CI checks before it deploys.** Even with the webhook reaching Coolify (delivery returns **200**), a deploy only fires once the commit's required checks (the vitest CI gate) pass. So **don't validate by "Redeliver" of a stale push** — that returns 200 but won't deploy, because the redelivered commit has no passing checks attached. Validate with a *real merge to `main`* and watch the deploy start after CI goes green.
