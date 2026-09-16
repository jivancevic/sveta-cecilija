# ADR-0028: CI is production's last gate, so the bypass is closed

**Status:** Accepted
**Date:** 2026-09-16
**Completes:** [ADR-0026](0026-production-auto-deploy-from-main.md) — it replaced the human click with machine gates but left the gates unenforced at the GitHub level.

## Context

ADR-0026 removed the manual **Redeploy** click and made a push to `main` deploy straight to production. It was explicit that CI is now the only thing standing in front of a system taking real card payments, and it wrote the rule down in CLAUDE.md: wait for all checks, read them, **never force-merge past a failing check and never use the admin bypass**, because Coolify deploys on the push webhook and not on CI success — a bypass reaches production directly.

That rule was never enforced. Checked on 2026-09-16: `enforce_admins` is `false` on `main`'s branch protection. The repository owner, and every agent authenticating with the owner's token, can merge a red PR with a single flag. ADR-0026 itself said so in as many words — "Nothing at the GitHub level enforces any of this ... so it is a rule, not a lock" — and treated that as acceptable because a solo maintainer cannot approve their own PR anyway.

Two things changed the calculus.

**The gate turned out to be cheap.** The suspicion that prompted this review was that the six required checks were slowing merges down. Measured over the last 25 PRs, the median time from opening a PR to merging it is **3.4 minutes**; the checks run in parallel and the longest is under three. The outliers are all waits on a human. There is no emergency in which three minutes is the obstacle — while a second, self-inflicted production incident, shipped by a tired maintainer who was sure the failing check was unrelated, costs hours and touches money that belongs to ticket buyers.

**The population of people who can press the button is not only people.** An agent is instructed to merge its own PR once every check is green (granted 2026-09-12). It authenticates as the owner. The rule against bypassing lives in a markdown file that an agent reads, summarises, and may compact away. "Discipline" is a weak control when one of the disciplined parties is a language model with an admin token.

## Decision

**Set `enforce_admins: true` on `main`, and do not build an emergency path.**

The rule from ADR-0026 becomes a lock: a red or pending check blocks the merge for everyone, including the owner and including any agent acting as the owner. There is no expedited lane, no reduced check set for urgent fixes, and no sanctioned bypass flag.

Alongside it, and for the same reason — the gate should be worth the three minutes it costs — the required set was trimmed from six checks to five. `prod-install` was removed: it ran `npm ci --omit=dev` to mirror what Coolify installed, but since [ADR-0012](0012-container-build-dockerfile-standalone.md) Coolify builds the repo-root `Dockerfile`, whose deps stage runs a full `npm ci` on the same npm major. It guarded a path production no longer takes. The remaining five are `lint-types`, `vitest`, `build`, `docker` and `drift`.

## Consequences

- A genuinely urgent production fix waits ~3 minutes for CI, the same as any other change. This is accepted, deliberately, as the price of the lock.
- If CI is *broken* rather than failing — a GitHub outage, a wedged required check that never reports — there is no way to ship. The recovery is to turn `enforce_admins` off, ship, and turn it back on, as a conscious two-step act with a trace in the audit log. That friction is the feature: it cannot happen absent-mindedly at 2am.
- A required check that is skipped rather than run reads as forever-pending and wedges the PR. This is why `docker`, `drift` and (since #649) the `ci.yml` jobs always report a conclusion and decide *internally* whether there is work to do, instead of using `paths:` filters.
- The lock protects nothing about what happens *after* the merge. Coolify still deploys on the push webhook, so a green merge of a genuinely broken change reaches production just as fast as before. This ADR closes the bypass; it does not add a post-merge gate, and adding one was considered and rejected in ADR-0026.

## Alternatives considered

**A named emergency path** — a reduced check set (say `vitest` + `docker`) usable under declared urgency, with the reason recorded. Rejected: it reintroduces the judgement call the lock exists to remove, and the moment when someone declares an emergency is precisely the moment their judgement is worst.

**Leave `enforce_admins: false` and rely on the written rule.** Rejected on the reasoning above: the rule already existed and was already unenforced, and the party most likely to breach it is the one least able to weigh an exception.

**A merge queue.** Rejected as machinery for a problem a solo maintainer does not have; `strict: false` plus a `push: main` run of the same checks already covers the stale-base case.
