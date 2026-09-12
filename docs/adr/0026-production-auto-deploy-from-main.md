# ADR-0026: Production deploys straight from `main`, gated by machines

**Status:** Accepted
**Date:** 2026-09-12
**Supersedes in part:** [ADR-0009](0009-staging-environment-on-coolify.md) — only its "production auto-deploy OFF" decision. The staging environment that ADR-0009 stands up is unchanged and stays.

## Context

ADR-0009 turned production auto-deploy **off** and made promotion a manual **Redeploy** click in Coolify, after the same commit had proven itself on `dev.moreska.eu`. In peak season, for a site taking real card payments, that was the right instinct.

Three months of living with it showed the click was not doing the job it was credited with. Everything below was verified on the box on 2026-09-12, before anything was changed:

- **Staging was never a gate.** `dev.moreska.eu` and `moreska.eu` are two independent Coolify applications that both track `main`. Staging auto-deploys, prod does not. Nothing chained them, and nothing ever read staging's result before prod could ship. The mental model of "it goes to staging, then to production" described a sequence in time, not a dependency.
- **The click was the only gate, and a click verifies nothing.** Pressing Redeploy does not read a diff, run a test, or look at staging. Its entire safety value was that a human happened to be paying attention at that moment.
- **The checks behind it were thinner than assumed.** Only `vitest` was a required status check on `main`; `lint-types`, `build`, `prod-install` and `drift` could all fail and still merge.
- **Nothing in CI ever ran the real build.** CI ran `next build` on `ubuntu-latest`; Coolify builds the `Dockerfile` on `node:22-slim`. The artifact that ships was never built before it shipped.
- **There was no health check anywhere.** `health_check_enabled = f` on both apps and `Config.Healthcheck = null` in the image, so Coolify would promote a container that could not serve a request.
- **There was no alerting at all.** All six Coolify notification channels were `enabled = f` with no transport configured. A failed production deploy, or a dead container, notified nobody.
- **Rollback was theoretical.** `docker_images_to_keep = 2`, but only one prod image was actually on disk, so "roll back" meant a full rebuild from source.

The click also had a cost, and it was the cost that prompted this. Production had drifted **10 commits** behind `main`. A step that depends on a solo maintainer remembering to perform it is not a safety mechanism; it is a queue, and the queue silently grew.

So the choice was never "safety versus convenience". It was: keep a ritual that checks nothing and causes drift, or spend the effort to make something check the things the ritual was imagined to check.

## Decision

**Replace the human click with machine gates, then turn production Automatic Deployment ON.** Order matters: every gate below was built, and proven, *before* the toggle was flipped.

### The gates, in the order a change passes through them

1. **All six status checks are required on `main`** — `vitest`, `lint-types`, `build`, `prod-install`, `docker`, `drift`. Previously only `vitest` was.

2. **CI builds and boots the real artifact** (`.github/workflows/docker.yml`). It runs the actual `docker build` against the `Dockerfile`, starts the image against a throwaway `postgres:18-alpine`, polls `/api/health` until it answers, and asserts both `ok:true` and `dbOk:true` plus that `bootstrap-db.mjs` actually created the schema. This is the gate that replaces the click: it exercises the same artifact, on the same base image, that Coolify will build.

3. **The image carries its own `HEALTHCHECK`**, so Coolify refuses to promote a container that cannot serve. Proven on staging: an unhealthy container is not promoted, the deployment is marked `failed`, and **the previous container keeps serving**. The probe lives in the `Dockerfile`, not in Coolify's UI, because Coolify's generated probe is `curl … || wget … || exit 1` and the runtime image has neither.

4. **Rollback is real.** `docker_images_to_keep` raised from 2 to 5 on prod, so the Rollback page offers actual images instead of one.

5. **Something is watching.** A GitHub Actions workflow polls `https://moreska.eu/api/health` every 10 minutes (`.github/workflows/uptime.yml`), and Coolify's Deployment Failure and Container Status Changes events now send email through the Brevo SMTP relay. Two independent watchers, one of which does not depend on the box being able to send its own mail.

### What does not change

**Staging stays, with auto-deploy ON.** It was never the thing being removed. ADR-0009's argument that a preview which rots unnoticed is worse than none still holds, and staging is where deploy-time behaviour gets proven before production is asked to trust it — as it was for the health gate itself.

### Where the human checkpoint moved

It moved one step earlier, to the merge button. Since the Redeploy click is gone, **merging to `main` is now the last human decision in front of a live payment system**, which is why CLAUDE.md forbids an agent from merging its own PR.

## Alternatives considered

1. **Keep the manual Redeploy.** Rejected. It verified nothing a machine was not better placed to verify, and its measurable effect was a 10-commit production lag. "A human is in the loop" is only a safety property if the human is checking something; here the human was clicking a button.
2. **Flip the toggle and stop there** (the literal request). Rejected, and this is the heart of the ADR: removing the human without replacing what the human was imagined to be doing converts a slow pipeline into a fast one with no gate at all. The toggle was the last step of this work, not the first.
3. **Keep prod manual but make CI stronger anyway.** Rejected as the worst of both: the drift remains, and the click's only remaining function is to delay a change that has already passed every check.
4. **A GitHub Actions "production" environment with a required reviewer.** Rejected. It re-creates the same click in a different UI, with the same solo maintainer approving their own change, and adds a second deploy path alongside Coolify's.
5. **Per-PR preview environments.** Still rejected, for ADR-0009's reason: DB provisioning and orchestration out of proportion to a solo developer's PR rate.
6. **Make `/api/health` a readiness check that fails on `dbOk:false`.** Rejected. Coolify reacts to an unhealthy container by restarting it, which does not fix Postgres and turns a transient blip into a restart loop on a container that was serving fine. The endpoint is liveness; `dbOk` is reported in the body and deliberately does not change the status code. The uptime workflow, which pages a person rather than restarting anything, is where `dbOk:false` does fail.
7. **Use Coolify's built-in HTTP health check instead of a Dockerfile `HEALTHCHECK`.** Rejected on evidence: its generated command needs `curl` or `wget`, neither of which exists in the runtime image, and it failed a demonstrably healthy container. Its CMD-style field also rejects the `node -e` equivalent as malformed.

## Consequences

- **Pro:** Production tracks `main`. The drift class of incident (a fix merged, believed shipped, still sitting in the queue) is gone.
- **Pro:** The gate now checks the artifact that actually ships, on the base image it actually ships on — which the previous gate never did.
- **Pro:** A bad deploy no longer takes the site down: the old container keeps serving and the deployment is marked failed.
- **Pro:** Failures reach a person, which was not true of any prior posture.
- **Con:** **Coolify's auto-deploy fires on the push webhook, not on CI success.** Branch protection is what keeps a red commit off `main`, and admin bypass is deliberately left on, so a force-merge would reach production without passing the checks. The container health gate is the backstop, not the primary defence — do not force-merge.
- **Con:** The merge button is now load-bearing. Mitigated by the CLAUDE.md rule and by the fact that it is the one point where a human is genuinely reading a diff.
- **Con:** PR feedback is slower and CI minutes higher, because every PR now runs a real `docker build`. This is the cost of gate 2 and it is the intended trade.
- **Con:** Coolify's alert mail shares the Brevo free tier (300/day) with transactional buyer mail. An alert storm competes with ticket confirmations. Acceptable at current volumes, worth revisiting if either grows.
- **Con:** Alerts are sent From `info@moreska.eu`, which is a send-as alias on the recipient's own Gmail, so Gmail can file them outside the inbox. Known and documented; a second, independent watcher with phone push is the mitigation.

## Related

- Issue #451 — the change itself, with the step-by-step record of what was verified on the box.
- PRs #452 (`/api/health` + CI docker-boot gate), #453 (Dockerfile `HEALTHCHECK`), #458 (uptime workflow).
- [ADR-0009](0009-staging-environment-on-coolify.md) — partially superseded; its staging environment stands.
- `docs/agents/deployment.md` — the operational runbook this ADR changes.
- `src/lib/health/health.ts` — why the probe is liveness and not readiness.
