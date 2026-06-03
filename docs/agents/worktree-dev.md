# Working in git worktrees (parallel agent sessions)

This repo runs many parallel agent sessions. `.claude/settings.json` has `"worktree": { "bgIsolation": "worktree" }`, so background sessions run in isolated git worktrees by default.

## Running the app inside a worktree

Three setup steps beyond `EnterWorktree`:

1. **`cp ../../../.env.local .env.local`** — three levels up from `.claude/worktrees/<name>/`. Git worktrees only share *tracked* files and `.env.local` is gitignored; without it, `src/payload.config.ts` fail-fasts on `PAYLOAD_SECRET`.
2. **`npm install --include=dev --no-audit --no-fund`** inside the worktree — the host `node_modules` is `--production`, so symlinking it leaves `@tailwindcss/postcss` and transitives like `enhanced-resolve` missing and every public page 500s on a postcss require. The install also mutates `package-lock.json`; revert it before any commit (`git checkout -- package-lock.json`) since unintended lockfile changes are a hard pre-merge gate.
3. **`rm -rf .next`** after the install — turbopack caches the earlier "module not found" resolution failures and keeps serving 500s even once the missing module is on disk.

If `bootstrap-db.mjs` itself fails on a stale enum and you only need to verify rendering, bypass it:
```sh
set -a && . "$(pwd)/.env.local" && set +a && PORT=<port> node_modules/.bin/next dev
```

## Payload `push:true` hangs `next dev` in a worktree

The parallel sessions share one `sveta_cecilija_dev` DB, so the DB often holds columns (e.g. `orders.review_opt_out`, `users.username`) that *your* branch's Payload config doesn't define. On dev startup `push` wants to drop them and prints an interactive `DATA LOSS WARNING … (y/N)` — with no TTY it reads EOF and `next dev` exits (answering `N` also aborts the push and exits).

**Don't** answer it or mutate the shared DB. Set `PAYLOAD_DISABLE_PUSH=1` (gate in `payload.config.ts`) to force push off; your schema is already applied by `bootstrap-db.mjs` from `app.sql`, so the app runs fine. Add new columns to `app.sql` (idempotent `ADD COLUMN IF NOT EXISTS`) for prod, not just the Payload field config.

## `gh pr merge` is server-side; your local `origin/main` ref goes stale

After merging a PR with `gh`, run `git fetch origin main` before you `git checkout -b new-branch origin/main` — otherwise the new branch is cut from the *pre-merge* main and silently lacks the just-merged work (and will look like it reverts it). Also: pushing a worktree branch that tracks a differently-named remote branch needs an explicit refspec — `git push origin HEAD:remote-branch-name`, not a bare `git push`. `gh pr merge --delete-branch` errors inside a worktree (main is checked out elsewhere) but the merge still lands; delete the remote branch manually.

## Stacked PRs don't get CI, so the required `vitest` check never reports

`.github/workflows/ci.yml` triggers only on `pull_request` to `main` (and push to `main`). A PR opened with a base branch other than `main` — a *stacked* PR — gets **zero CI runs**, so the required `vitest` check (branch protection) never reports and the PR sits `BLOCKED` ("waiting for status") even though it's `MERGEABLE`.

Retargeting it (`gh pr edit <n> --base main`) doesn't help: that fires a `pull_request` `edited` event, which isn't in the default trigger set `[opened, synchronize, reopened]`. To fire CI without a code change, **close then reopen the PR** (`gh pr close <n> && gh pr reopen <n>` → `reopened` event).

Also: GitHub auto-retargets a child PR's base only when the parent *branch* is deleted, not when the parent PR merges — so after merging the parent you must `gh pr edit <child> --base main` yourself.

**Merge a stacked chain like this** (use merge commits, never squash — squashing the parent rewrites its commits so the child then conflicts):

```sh
gh pr merge <parent> --merge
gh pr edit <child> --base main                # parent's changes are now in main
gh pr close <child> && gh pr reopen <child>   # fire CI so vitest reports
# wait for the vitest check to pass, then:
gh pr merge <child> --merge
```

Prefer **not** stacking unless the PRs genuinely overlap files — independent PRs off `main` each get CI for free. Don't rely on `gh pr merge --admin` to skip the gate (it's blocked here anyway).
