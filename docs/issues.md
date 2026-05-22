Here's the full picture of your 10 open issues (excluding #1 which is the parent PRD):

---
Open Issues Summary

HITL (you must do manually)

#2 — Infrastructure — Provision Hetzner server, install Coolify, configure DNS + SSL, deploy frontend. No blockers. (Note: the issue says DigitalOcean but CLAUDE.md was updated to Hetzner — the issue is stale on that detail.)

#11 — Cutover — Smoke test + DNS switch. Blocked by everything else.

---
AFK (Claude can do these)

The dependency chain dictates the order:

#3 (Payload CMS + Postgres)
  ├── #4 (Performances page ← Shows DB)
  │     └── #5 (Stripe checkout)
  │           ├── #6 (QR email via Brevo)
  │           ├── #7 (Door scan endpoint)
  │           └── #10 (Admin: order list + refund)
  └── #8 (Admin: show management)
        └── #9 (Admin: in-person sales)

Start here → #3 is the critical path. Nothing else can move until Payload CMS + PostgreSQL is wired in. It has no blockers and can be built locally without the server.

After #3: #4 and #8 can be done in parallel (both blocked only by #3).
After #4: #5 (Stripe checkout).
After #5: #6, #7, #10 in parallel.

---
Recommended attack order

1. You (now): Do #2 — the server infra, following docs/todo.md. This is all manual clicks in Hetzner + Coolify.
2. Claude: #3 → #4 + #8 → #5 → #6 + #7 + #10 → #9.
3. You (final): #11 — smoke test + DNS cutover.

---
Useful skills for tackling these

- /tdd — ideal for #5 (Stripe checkout) and #7 (door scan) which have explicit race-safety and correctness requirements in the acceptance criteria. Write the tests first, then implement.
- /verify — use this after each issue to confirm the feature actually works in the running app before marking it done.
- /diagnose — keep this handy for #5 (Stripe webhook integration tends to have tricky debugging).
- /run — spin up the local dev server to manually test UI flows during #4 and #5.

The highest-leverage next step is telling me to start #3 (Payload CMS + PostgreSQL integration) — I can do that entirely on the dev branch while you handle the infra in parallel.