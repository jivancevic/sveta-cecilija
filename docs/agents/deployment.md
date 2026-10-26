# Deployment (Coolify on Hetzner)

Two Coolify apps on one Hetzner box both track `main`, but **only prod auto-deploys** ([ADR-0026](../adr/0026-production-auto-deploy-from-main.md), superseding ADR-0009's manual-prod half; staging's auto-deploy was turned off by #649): a push to `main` lands on **`moreska.eu` (prod)**, and **`dev.moreska.eu`** ships when you click it. They were never chained — staging has never been a gate in front of prod, it is a second app that happens to track the same branch — and once prod stopped waiting for a human, a staging build on every push verified nothing prod would not find seconds later while taking half of a 4-vCPU box from the build that matters (measured 2026-09-16: prod 225 s and staging 172 s, concurrent, on the same push). What gates prod is machinery, not a click: all five status checks are required on `main`, CI boots the real Docker image against a throwaway Postgres, and Coolify refuses to promote a container whose `HEALTHCHECK` fails (the old container keeps serving instead). After the merge, the `smoke` workflow (`.github/workflows/smoke.yml`, #703) waits up to 10 min for `https://moreska.eu/api/health` to answer with the merged commit's short sha — the one watcher that asks *which* commit prod runs rather than whether it is up (#691: a dropped push webhook left `main` and production disagreeing for six hours with every alarm green). Red means [Rollback](#rollback). How a PR gets to `main` at all is `AGENTS.md` → How work ships.

**`watch_paths` on both apps is exactly these two lines** (applied 2026-09-16, #649), so a markdown commit does not restart a container taking card payments for an image `.dockerignore` makes byte-identical:

```
!docs/**
!**/*.md
```

Spell the second one `**/*.md`, never `*.md`: Coolify compiles a pattern to an **anchored** regex in which `*` does not cross `/` (`app/Models/Application.php`, `globToRegex`), so `*.md` would catch `CLAUDE.md` and miss `docs/agents/deployment.md`. The rest of that matcher is why this is safe to set at all: patterns are evaluated in order and the last match wins, and a changed file matching **no** pattern is **included** when every pattern is an exclusion. A path nobody thought of therefore still deploys — the failure mode is a needless deploy, never a silently skipped one. The accepted consequence (#649): the Cecilija footer's build line and `/api/health` report **the commit in the image**, which can trail the tip of `main` by a run of docs commits. Hotfixes are just "merge to main"; no special path. No `dev` git branch (single trunk). Don't use Vercel — Payload's long-lived Postgres pool + bootstrap-on-start fights serverless.

> **The merge is the last checkpoint, and since #703 GitHub performs it**: `/ship` arms `gh pr merge --auto --squash` and the merge happens the moment all five required checks pass (`AGENTS.md` → How work ships). With the Redeploy click gone, nothing stands between a merge and the live payment site except CI. Coolify auto-deploys on the *push webhook*, not on CI success, so branch protection is what keeps a red commit off `main` — and since #649 the bypass is **shut**, not merely discouraged: `enforce_admins` is `true` ([ADR-0029](../adr/0029-ci-is-the-last-gate-and-the-bypass-is-closed.md)). **Never force-merge past a failing check**; the container health gate is a backstop, not permission.

> **If you do Redeploy by hand** (a rollback, or re-running a deploy without a new commit), **pick the *right* app.** That same Coolify instance also hosts an unrelated **`korcula-stays`** project (e.g. `korcula-pms`) — easy to Redeploy by mistake. Prod moreska.eu is **project `moreska-eu` → production → app `sveta-cecilija:main-zek88q652dijih0ywodgffux`** (domains `moreska.eu` + `www.moreska.eu`, Build Pack: Dockerfile). Before clicking Redeploy, confirm the breadcrumb reads `moreska-eu › production › sveta-cecilija…`; after, confirm the deploy log line `Importing jivancevic/sveta-cecilija:main (commit sha …)` matches the commit you just merged. The Coolify UI is reached via an SSH tunnel to `localhost:8000`; if it shows an error page, the tunnel dropped (`curl localhost:8000` → `000`) — re-establish it first.

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
- `CRON_SECRET` — bearer for the cron routes (`/api/cron/send-review-emails`, `/api/cron/moreskant-notifications`).
- `CALENDAR_FEED_TOKEN` — the single secret behind the shared ICS calendar feed (#433). Generate with `openssl rand -hex 24`. The URL is `https://moreska.eu/api/app/calendar/<token>.ics` and the `/app` "Kalendar" panel renders it from `NEXT_PUBLIC_BASE_URL` + the token; unset, the panel is hidden and the route answers **500 with a log** (a 404 would read like a wrong link). Rotating it silently breaks every calendar already subscribed, so tell the dancers before you do.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — web push for Cecilija (#431). Generate the pair **once** with
  `node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"` and paste both into Coolify; the subject is `mailto:info@moreska.eu`. **Rotating the private key invalidates every existing subscription**, so a rotation has to be followed by `DELETE FROM push_subscriptions` and every dancer pressing "Uključi obavijesti" again. Without the keys the app still works and simply sends nothing.

- `MCP_CLIENT_ID`, `MCP_REDIRECT_URIS` — the Claude connector's OAuth client (#438). `MCP_CLIENT_ID` is any stable string the client sends back (`claude` in prod); `MCP_REDIRECT_URIS` is a comma-separated allow-list, and in production it is `https://claude.ai/api/mcp/auth_callback`. There is **no client secret** to set (why: `moreskant-app.md` → *Connecting*). Neither value is a secret in the "rotate on leak" sense, but both must be set or the flow is refused. Changing `MCP_REDIRECT_URIS` does not invalidate any issued token; changing `MCP_CLIENT_ID` stops the next authorization, not the existing connections.

  **Revoking a connector** (the ops answer, and the only place it is written down): `DELETE FROM oauth_tokens WHERE user_id = <id>` disconnects that voditelj's Claude app, and removing their `moreska` permission in `/admin` does the same without touching a row. Deleting the account takes both with it. There is no per-token UI: this is a two-voditelj society.

Setting/changing any of these requires a redeploy — Coolify env doesn't hot-reload into the running container.

## What runs at startup

```sh
node scripts/bootstrap-db.mjs   # idempotent SQL from db/schema/*.sql
node server.js                  # the actual app (Next.js standalone entry point)
```

This is the container `CMD`. If bootstrap fails, the container exits — `server.js` never runs. Logs will show `[bootstrap-db] failed: <reason>`. The script also handles `DATABASE_URL not set` gracefully (logs and skips, so the app can start in degraded mode for debugging).

## Coolify scheduled tasks

Two, both hitting a `CRON_SECRET`-bearer route with `node -e fetch` rather than
`curl` (the app image has node, not curl):

| Task | Schedule | Command |
|---|---|---|
| Review emails (#378) | `*/15 * * * *` | `node -e "fetch('http://localhost:3000/api/cron/send-review-emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"` |
| Moreškant alarm + reminder (#435) | `*/15 * * * *` | `node -e "fetch('http://localhost:3000/api/cron/moreskant-notifications',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"` |

Both are idempotent by claim, so a missed run costs at most a delay and a double
run sends once. The roster task prints a JSON summary
(`{performances, alarm:{…}, reminder:{…}, errors}`) to the task log; `claimed`
without `sent` means the alarm was claimed and skipped because no army was short,
which is the intended behaviour, not a failure.

## Deploy triggers

Both apps connect to the repo via the same Coolify **GitHub App** (no per-repo deploy webhook — its hook lives at the App/installation level, so `gh api repos/.../hooks` is empty by design). Whether a push to `main` deploys is governed by each app's **Automatic Deployment** toggle, and since 2026-09-12 **both are ON** (ADR-0026). If either stops auto-deploying, check that per-app toggle first: it is `application_settings.is_auto_deploy_enabled`, and `Application::isDeployable()` reads nothing else. Unlike the Git branch field, this toggle really does persist — verify it in Coolify's own database rather than trusting the UI.

### If auto-deploy isn't firing (two non-obvious gotchas, both cost real time in #226)

1. **Inbound firewall must allow GitHub → Coolify webhook.** The GitHub App's `push` webhook is *inbound* to Coolify at `http://<box-ip>:8000`; manual **Redeploy** is *outbound* (the box clones GitHub), so Redeploy working tells you nothing about the webhook. If GitHub App → **Recent Deliveries** show `push` events failing with **"failed to connect to host"** (and `curl http://<box-ip>:8000` returns `code=000`), TCP 8000 is firewalled. Fix: add an **inbound rule in the Hetzner Cloud Firewall** — TCP, port **8000**, source = the GitHub `hooks` ranges from `https://api.github.com/meta` (re-check, they drift), **never `0.0.0.0/0`** (that exposes the Coolify dashboard). In the Hetzner rule form the CIDRs go in the **Source IPs** field (the "Any IPv4 / Any IPv6" box, type each + Enter), and `8000` goes in the **Port** field — a CIDR in the Port field errors "End port have to be higher than the start port". Host `ufw` was not a second blocker here, but check `sudo ufw status` if the cloud-firewall rule alone doesn't fix it.

2. **Coolify deploys on the push webhook, not on CI success** ([ADR-0026](../adr/0026-production-auto-deploy-from-main.md)); what keeps a red commit off `main` is branch protection, and a commit only ever reaches `main` with its checks green, which is why it *looks* as if Coolify waited for CI. (This paragraph used to claim it did, from #226; the ADRs and CLAUDE.md say the opposite and they are right.) So **don't validate the webhook by "Redeliver" of a stale push** — in #226 that returned 200 and deployed nothing, because the redelivered commit was already the one running. Validate with a *real merge to `main`*: `smoke` goes green when the new container answers with the merged commit. And know that a **single delivery can be dropped** while the integration is healthy (#691: the next merge deployed on its own and carried the missed commit as an ancestor); `smoke` is what notices, and `scripts/coolify-env.sh redeploy` ships the tip of `main` without waiting for the next one.

## Rollback

Every merge to `main` goes to production with no staging in the path, so this is the undo. It was written down (#703) before *Allow auto-merge* was switched on, and it is the first thing to reach for when `smoke` is red or the app misbehaves after a merge. Diagnose after.

**1. Find the bad and the last good commit.**

```bash
scripts/coolify-env.sh deployments   # status, commit, started, finished — newest first
scripts/coolify-env.sh health        # what prod answers right now: {"ok":true,"commit":"<short sha>","dbOk":true}
```

The newest `finished` row before the bad one is the commit to go back to. `git log --oneline origin/main` names what each sha is.

**2. Put the last good image back (about a minute, no rebuild).**

```bash
scripts/coolify-env.sh rollback-images        # tags (= commit shas) still on the server
scripts/coolify-env.sh rollback <good-sha>    # redeploy that image
scripts/coolify-env.sh health                 # commit = <good-sha> → the old code is live again
```

`/api/health`'s `commit` is the sha of the image that answers, so the good sha there means the rollback took. The `smoke` run of the bad merge stays red: it wanted the bad commit.

Only the images Coolify kept are offered: `docker_images_to_keep` was raised from 2 to 5 for prod in ADR-0026 (verified 5 on 2026-10-26). The API does not return that number (Coolify 4.5.0 keeps it in `application_settings`, not on the application body, and `PATCH` ignores it), so read it in the UI, the app's **Rollback** tab, or on the box: `ssh hetzner "docker exec coolify-db psql -U coolify -d coolify -tAc \"select s.docker_images_to_keep from application_settings s join applications a on a.id=s.application_id where a.uuid='zek88q652dijih0ywodgffux'\""`. `scripts/coolify-env.sh rollback-images` lists what is actually there. Older than that, the revert PR below is the only way back. The rollback API needs Coolify 4.3.23+ (`scripts/coolify-env.sh version`); on an older server both commands exit with a message saying so, and the same thing is done by hand: Coolify UI → **`moreska-eu` › production › `sveta-cecilija:main-zek88…`** → **Rollback** → the image tagged with the last good commit → **Rollback**. Check the breadcrumb first: the same Coolify hosts the unrelated `korcula-pms`, and the staging app `dev.moreska.eu` is one row away.

**3. Revert on `main`, always.** Step 2 only swaps what runs; `main` still holds the bad commit and the next merge deploys it again. The revert also works alone when the good image is gone: about 3 min of CI and ~155 s of rollout, so prod is back in about five minutes.

```bash
git fetch origin
git switch -c revert-<short-sha> origin/main
git revert --no-edit <bad-sha>
git push -u origin HEAD
gh pr create --fill
gh pr merge --auto --squash
```

**Migrations do not roll back.** `bootstrap-db.mjs` applies `db/schema/*.sql` forward on every boot (`db-bootstrap.md`), so old code on a schema that only gained columns, tables or enum values works. A migration that drops or rewrites data cannot be undone by any of the above, which is why it never merges without asking first (STANDARDS gate G2).

## Driving Coolify from a script

`scripts/coolify-env.sh` (Sufler's, copied with this app's uuid and health path; #703) talks to the Coolify API for the prod app `zek88q652dijih0ywodgffux` — the uuid is a constant in the script and never resolved from the domain, because `dev.moreska.eu` contains `moreska.eu`. It loads its config from **one place outside any checkout** (a worktree does not copy gitignored files), `~/.config/moreska/` or `$MORESKA_DEPLOY_DIR`:

| File | Holds (names only; values never appear in the repo) |
|---|---|
| `deploy.env` | `COOLIFY_BASE_URL` (the control plane, `https://…` behind Cloudflare Access, or `http://localhost:8000` over the `ssh coolify` tunnel); optionally `COOLIFY_APP_UUID` and `APP_DOMAIN` to point it elsewhere |
| `deploy.secrets` (chmod 600) | `COOLIFY_TOKEN`; `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` when the base URL goes through Cloudflare Access (omit them over the tunnel) |

Both files are `source`-d: one `KEY=value` per line, quoted if it has spaces, no multi-line values. These are deploy secrets, not app runtime env — the app's env is the list above and is set in Coolify. The token is a Coolify API token for the instance both of Josip's Coolify apps share; where it is kept, and the move to a secrets manager, is the operator's business and not this repo's.

```bash
scripts/coolify-env.sh health            # GET https://moreska.eu/api/health
scripts/coolify-env.sh settings          # health check settings, read back (read-only; images-to-keep is not in the API, see Rollback)
scripts/coolify-env.sh version           # Coolify version (rollback needs 4.3.23+)
scripts/coolify-env.sh deployments       # last 10 deployments with their commits
scripts/coolify-env.sh rollback-images / rollback <sha>   # see Rollback
scripts/coolify-env.sh redeploy          # deploy the tip of main again, no new commit (a dropped webhook, an env change)
scripts/coolify-env.sh env-get / env-set K V               # app env, keys only on read
```

**The health probe here is the Dockerfile `HEALTHCHECK`, not Coolify's HTTP check** (ADR-0026, alternative 7: Coolify's generated probe is `curl … || wget …` and the `node:22-slim` runtime image has neither, so turning the UI check on fails a healthy container). `settings` shows `health_check_enabled` and `custom_healthcheck_found`; the second is the one that must be true. `healthcheck-host` is kept from Sufler as a read-back tool and does not turn the check on. To let an agent run the script without a per-call prompt a human adds `Bash(scripts/coolify-env.sh:*)` to `.claude/settings.json`; the agent never widens its own permissions.

## Runbook: subscribe the live webhook to Stripe dispute events (#380)

**Why this exists:** the dispute handler is dead code until Stripe is told to send the events. Nothing in the app can do this — webhook subscriptions are dashboard/API state on the Stripe account, not config in this repo.

**Live state** (verified 2026-08-21 via `GET /v1/webhook_endpoints`, live key):

| Endpoint | URL | Status | Events |
|---|---|---|---|
| `we_1TZquZ2LKHW8z1M1IxBbdyn2` | `https://moreska.eu/api/stripe/webhook` | **enabled** | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`, `charge.dispute.closed` |
| `we_1TWXAw2LKHW8z1M18DM6p4dg` | `https://tickets.korcula-moreska.com/?wc-api=wc_stripe` | **disabled** | legacy WooCommerce set (includes the dispute events, but the endpoint is off) |

**The subscription step below is DONE** — the dispute events were added to the live endpoint on 2026-08-21, keeping the same endpoint id (so `STRIPE_WEBHOOK_SECRET` was not rotated). The steps are kept for the next time this account needs an event added, and because the same "don't create a new endpoint" trap applies every time.

There is **one** endpoint to change, not two. The legacy Woo endpoint is already disabled and must stay that way — do not re-enable it to "help".

### Steps

1. **Deploy this branch first.** Merging to `main` ships it (see *Deploy triggers*). Enabling the events before the code ships is harmless (the old handler 200s and ignores unknown types), but you want the handler live so the first real dispute is actually processed.
2. Stripe Dashboard → **Developers → Webhooks**. Confirm the toggle top-right reads **live mode**, not test — the test-mode endpoint list is separate and changing it does nothing for real chargebacks.
3. Open the endpoint whose URL is `https://moreska.eu/api/stripe/webhook` (`we_1TZquZ…`).
4. **Update details → Select events**, add:
   - `charge.dispute.created`
   - `charge.dispute.closed`
5. Save. **Do not create a new endpoint** — a new one issues a new signing secret, and `STRIPE_WEBHOOK_SECRET` in Coolify would then be wrong for it. Adding events to an existing endpoint does **not** rotate its secret, so no env change is needed.

### Verify

From the prod container, so the key never leaves the box:

```bash
ssh hetzner "docker exec <app-container> node -e '
const k=process.env.STRIPE_SECRET_KEY;
fetch(\"https://api.stripe.com/v1/webhook_endpoints\",{headers:{Authorization:\"Bearer \"+k}})
 .then(r=>r.json()).then(j=>j.data.forEach(e=>console.log(e.status, e.url, (e.enabled_events||[]).join(\",\"))));
'"
```

Expect the moreska.eu row to list both `charge.dispute.*` events. Then in the dashboard use **Send test webhook** on that endpoint with `charge.dispute.created`: the app should 200, a `stripe_dispute_created` row should appear in `critical_events`, and an alert should reach `info@`. The test payload carries a fake payment intent, so expect `order: null` and an `UNKNOWN ORDER` subject — that is the correct response, not a bug.

### Cleanup after a test send

The test row occupies the idempotency claim for its dispute id, which is harmless (test ids never recur). If you want it gone:

```sql
DELETE FROM critical_events
WHERE kind LIKE 'stripe_dispute%' AND context->>'disputeId' LIKE 'du_00000000%';
```
