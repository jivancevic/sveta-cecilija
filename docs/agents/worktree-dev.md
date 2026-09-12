# Working in git worktrees (parallel agent sessions)

This repo runs many parallel agent sessions. `.claude/settings.json` has `"worktree": { "bgIsolation": "worktree" }`, so background sessions run in isolated git worktrees by default.

## Running the app inside a worktree

Three setup steps beyond `EnterWorktree`:

1. **`cp ../../../.env.local .env.local`** — three levels up from `.claude/worktrees/<name>/`. Git worktrees only share *tracked* files and `.env.local` is gitignored; without it, `src/payload.config.ts` fail-fasts on `PAYLOAD_SECRET`.
2. **`npm install --include=dev --no-audit --no-fund`** inside the worktree — the host `node_modules` is `--production`, so symlinking it leaves `@tailwindcss/postcss` and transitives like `enhanced-resolve` missing and every public page 500s on a postcss require. The install also mutates `package-lock.json`; revert it before any commit (`git checkout -- package-lock.json`) since unintended lockfile changes are a hard pre-merge gate.
3. **`rm -rf .next`** after the install — turbopack caches the earlier "module not found" resolution failures and keeps serving 500s even once the missing module is on disk.

**`NEXT_PUBLIC_BASE_URL` must name the port you actually run on**, or every cookie-authenticated route answers 401 and `/app` bounces to the login page: Payload's CSRF gate compares the request `Origin` against `serverURL`, so a `.env.local` saying `:3000` while you serve `:3424` rejects the cookie in silence (`payload-admin.md`). Start a worktree server with both set together:

```sh
NEXT_PUBLIC_BASE_URL=http://localhost:3424 PAYLOAD_DISABLE_PUSH=1 PORT=3424 npm run dev
```

**Sample dancers for `/app`**: a fresh database has 14 comp-attribution Members and no moreškanti, so the roster app opens empty. `set -a && . ./.env.local && set +a && node scripts/seed-dev-moreskanti.mjs` flags six sample dancers with roles, links the dev test logins and answers the next performances of the season. It is idempotent and refuses any database not named exactly `sveta_cecilija_dev`; it lives outside `db/schema/` so bootstrap never applies it to production.

If `bootstrap-db.mjs` itself fails on a stale enum and you only need to verify rendering, bypass it:
```sh
set -a && . "$(pwd)/.env.local" && set +a && PORT=<port> node_modules/.bin/next dev
```

## Payload `push:true` hangs `next dev` in a worktree

The parallel sessions share one `sveta_cecilija_dev` DB, so the DB often holds columns (e.g. `orders.review_opt_out`, `users.username`) that *your* branch's Payload config doesn't define. On dev startup `push` wants to drop them and prints an interactive `DATA LOSS WARNING … (y/N)` — with no TTY it reads EOF and `next dev` exits (answering `N` also aborts the push and exits).

**Don't** answer it or mutate the shared DB. Set `PAYLOAD_DISABLE_PUSH=1` (gate in `payload.config.ts`) to force push off; your schema is already applied by `bootstrap-db.mjs` from `app.sql`, so the app runs fine. Add new columns to `app.sql` (idempotent `ADD COLUMN IF NOT EXISTS`) for prod, not just the Payload field config.

## `gh pr merge` is server-side; your local `origin/main` ref goes stale

After merging a PR with `gh`, run `git fetch origin main` before you `git checkout -b new-branch origin/main` — otherwise the new branch is cut from the *pre-merge* main and silently lacks the just-merged work (and will look like it reverts it). Also: pushing a worktree branch that tracks a differently-named remote branch needs an explicit refspec — `git push origin HEAD:remote-branch-name`, not a bare `git push`. `gh pr merge --delete-branch` errors inside a worktree (main is checked out elsewhere) but the merge still lands; delete the remote branch manually.

## Stacked PRs don't get CI, so the required checks never report

`.github/workflows/ci.yml` triggers only on `pull_request` to `main` (and push to `main`). A PR opened with a base branch other than `main` — a *stacked* PR — gets **zero CI runs**, so the six required checks (`vitest`, `lint-types`, `build`, `prod-install`, `docker`, `drift`) never report and the PR sits `BLOCKED` ("waiting for status") even though it's `MERGEABLE`.

Retargeting it (`gh pr edit <n> --base main`) doesn't help: that fires a `pull_request` `edited` event, which isn't in the default trigger set `[opened, synchronize, reopened]`. To fire CI without a code change, **close then reopen the PR** (`gh pr close <n> && gh pr reopen <n>` → `reopened` event).

Also: GitHub auto-retargets a child PR's base only when the parent *branch* is deleted, not when the parent PR merges — so after merging the parent you must `gh pr edit <child> --base main` yourself.

**Merge a stacked chain like this** (use merge commits, never squash — squashing the parent rewrites its commits so the child then conflicts):

```sh
gh pr merge <parent> --merge
gh pr edit <child> --base main                # parent's changes are now in main
gh pr close <child> && gh pr reopen <child>   # fire CI so the checks report
# wait for the vitest check to pass, then:
gh pr merge <child> --merge
```

Prefer **not** stacking unless the PRs genuinely overlap files — independent PRs off `main` each get CI for free.

## A compound shell command that names `git` or `gh` is refused

A worktree-isolated session may only run git operations it can prove target its own worktree, and the guard gives up on anything it cannot parse statically. Two shapes that look harmless are refused outright:

- **Command substitution around git** — `cd "$(git rev-parse --show-toplevel)" && sed -i '' …` is rejected ("names git in a form too complex to verify").
- **A heredoc or `;`-chain ending in `gh`** — `cat > body.md <<'EOF' … EOF; gh pr create --title "refactor(api): …; rename …"` is rejected because the guard cannot show the `gh` call is not git. The semicolon inside the *title* is enough to trip it.

Neither is a permission denial, so retrying verbatim does not help. **Split them into plain, separate commands**: write the body with the Write tool, then call `gh pr create --body-file <path>` on its own. Paths already resolve inside the worktree, so the `cd "$(git rev-parse …)"` was never needed in the first place. A related guard blocks `python3 - <<'PY' … PY` edits of files under `docs/`; use the Edit tool for those.

> **An agent may run the `gh pr merge` calls above once every check is green** (CLAUDE.md, granted 2026-09-12 — it replaced the older rule that reserved the merge click for a human). A pending check is not a passing one: read all six before merging. And do not reach for `gh pr merge --admin` to get past a red check: `enforce_admins` is **false** on this repo, so GitHub will happily let it through — and since [ADR-0026](../adr/0026-production-auto-deploy-from-main.md) a push to `main` deploys straight to production. The bypass is not blocked; it is simply never the right move.
