<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## How work ships

This repo follows `~/.agents/STANDARDS.md` (the loop, the gates, the never-list, `/ship`). Below are only this repo's facts and where it is stricter.

- **A merge to `main` is a production deploy**: Coolify deploys every push to `main` to `moreska.eu` by webhook, with no staging in the path ([ADR-0026](docs/adr/0026-production-auto-deploy-from-main.md)). A docs-only change (`docs/**`, any `*.md`) neither gates nor deploys, so after one `/api/health` keeps reporting the commit in the image, not the tip of `main`.
- **Post-merge check**: the `smoke` workflow (`.github/workflows/smoke.yml`, [runs](https://github.com/jivancevic/sveta-cecilija/actions/workflows/smoke.yml)) waits up to 10 min for `https://moreska.eu/api/health` to answer 200 with `commit` equal to the merged commit's short sha, and reports green without waiting on a docs-only push. Red, or prod misbehaving after a merge: roll back first, diagnose after.
- **Rollback**: `scripts/coolify-env.sh rollback <good-sha>`, then a revert PR, always. Runbook: `docs/agents/deployment.md` → Rollback (the by-hand path is Coolify UI → the `zek88…` app → Rollback; migrations do not roll back).
- **Required checks**: `lint-types`, `vitest`, `build`, `docker`, `drift`. GitHub performs `gh pr merge --auto --squash` the moment all five pass; nobody polls CI.
- **Stricter here**: `enforce_admins` is on, so CI is the lock for everyone including the human, and there is no emergency path ([ADR-0029](docs/adr/0029-ci-is-the-last-gate-and-the-bypass-is-closed.md) has the recovery for *broken* CI). The health probe is the image's own `HEALTHCHECK` (Dockerfile, asserted by the `docker` check), not Coolify's HTTP check (ADR-0026, alternative 7). The one by-hand exception to squash is a stacked PR chain (`docs/agents/worktree-dev.md`), which `/ship` does not run.
