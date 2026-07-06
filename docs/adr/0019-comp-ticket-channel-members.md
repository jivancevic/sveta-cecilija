# ADR-0019: Comp ticket channel + Members entity

**Status:** Accepted
**Date:** 2026-07-06

## Context

moreska.eu has three ways tickets reach attendees: **online** (Stripe → `Order` + tickets + PDF email), **partner** (a reseller issues at face value, settled monthly — ADR-0008), and **in-person** (a bare `inPersonSold` counter, no artifact — the door cash tally).

HGD needs a fourth path for its own goodwill. Society **members** contact an admin and ask for free tickets to hand to family and friends. The admin issues them, records **which member** received them, and the guest gets a printable/claimable ticket. There is **no money** and **no reseller** involved — it is the org giving away seats.

This looks almost exactly like a partner sale (issue per-person tickets, no Stripe, print a PDF), with two differences: the tickets are **free** (`total = 0`), and the attribution is to an **HGD member**, not a commercial reseller. HGD wants **per-member reporting** ("how many comps did member X receive this season") — the reason attribution must be structured, not a scribbled note.

Per-person tickets (ADR-0007) and the partner channel/claim machinery (ADR-0008) are prerequisites — this ADR reuses both.

## Decision

### `comp` as a third `channel`, not a €0 `online` order

Extend `Orders.channel` to `online | partner | comp`. A comp order carries `total = 0`, `stripePaymentIntentId = null`, and a `member` relationship. Modelling it as a distinct channel (rather than an `online` order with `total = 0`) keeps comps **out of revenue math by construction** — "Revenue collected", the online channel-mix chart, and the "last Stripe webhook" health signal all filter on channel and never see a comp. It also gives a clean `WHERE channel='comp'` for the per-show count and per-member report. This reuses the ADR-0008 `channel` discriminator pattern, so the single `tickets → orders → shows` join path (door scan, stats, PDF) stays uniform.

### Member as a first-class entity

New Payload **`Members`** collection: `name` (required), `active` (default true — retired members drop out of the picker without deleting history), `note` (optional free text). **No** email/phone/OIB/login — unlike `Partners`, nothing here involves money, law, or authentication; a member never logs in. Chosen over a free-text attribution field because the stated requirement is **per-member reporting** (`GROUP BY member`), which a relationship serves cleanly and a text column would only approximate. Every comp order **must** reference a member (attribution is the whole point; enforced in the issue handler). **No per-member cap** is enforced — reporting is observational.

### Issue flow (admin-only, partner-shaped)

Admin-tier only (not tehnika, not partner). A new admin-dashboard action opens a **partner-style form**: show picker with live remaining, a searchable **member picker** with inline **"+ Add member"** create-on-the-fly, the ±/typeable stepper for adult/child, an optional name field, and an optional email. Issuing reuses the partner sell's advisory-lock `count → capacity-check → insert` critical section (`assertCanSell`), so comps are **capacity-guarded** exactly like a partner sale and participate in the same oversell serialization. It produces one `Order` (`channel='comp'`, `member=X`, `total=0`) with one `adult|child` **Ticket per person** — real rows that consume seats through the normal active-ticket count. The admin prints the combined 2-up A5 PDF via the existing `/api/orders/[id]/tickets.pdf` (already admin-authed, already handles zero-total).

### Names: member attribution vs printed holder vs claimed name

Three distinct things:

- **`member`** (required) — who *received* the comps. Internal attribution only, **never printed**.
- **`buyerName`** (the printed HOLDER row) — **defaults to the member's name**, editable at issue time (the admin may type a specific guest). The member is not the same field as the printed name.
- **Claimed name** — a family/friend claims via the existing unauthenticated `/scan/[token]` flow (gated purely on `email == null`, so comps drop in with no new branch). The existing first-claimer-wins write **overwrites `buyerName`** with the guest's name and sets `email`, so the **digital ticket they receive shows their own name**. The printed slip keeps the member's name; both copies share one `token` and both scan (admission is token-based).

### Slip, comms, cancellation reuse existing mechanisms

- **Slip:** "Gratis / Complimentary" (localized) in the price slot instead of "Adult · €20". **No** SOLD BY / provenance / member row. Unclaimed slips carry the same gold **claim band** as partner slips (suppressed once claimed).
- **Comms:** if an email is present (admin-entered or claim-attached), the ADR-0008 buyer-comms rules apply **unchanged** (transactional PDF, operational show-change notices, soft-opt-in review with unsubscribe) — consistency across channels is a requirement.
- **Cancellation:** the existing single void mechanism, `cancel_reason='storno'` ("cancelled, no money moved"; comp voids are distinguished from partner storno by `channel='comp'`, so **no new enum value**). **Admin-tier only, no time window** — the same-day rule is partner self-service, not an admin constraint.

### Dashboard visibility (seat reconciliation)

Comps get a **visible per-show count** in the admin show list next to online/in-person so the seat math reconciles (`online + in-person + comp + remaining + legacyReserved = capacity`) — otherwise the consumed seats read as a bug. Season-level: a **count only** ("Comps issued: N"), never in Revenue collected. At the door, comps count in "X / Y ušlo" (real people) with no revenue exposure and are findable by the existing name/code lookup. A **single flat "comps per member" table** (season count + adult/child split) covers the reporting need — no per-member drill-down page for now.

## Alternatives considered

1. **€0 `online` order (no new channel).** Rejected: silently pollutes revenue math, the online channel-mix chart, and the "last Stripe webhook" health signal; every money/stats query would need a `total > 0` guard bolted on. A distinct channel keeps comps out by construction.
2. **Free-text attribution field instead of a `Members` collection.** Rejected: the requirement is per-member reporting; a relationship groups cleanly, a text column drifts (typos, "Ante" vs "Ante Marić") and can't back a picker. `Members` is cheap — three fields, no auth/money.
3. **Reuse `Partners` with a 100% "commission" / zero face value.** Rejected: conflates a commercial reseller (OIB, login, invoicing) with an internal goodwill gift; would surface comps in partner reconciliation and pollute the partner picker.
4. **New `comp` cancel reason.** Rejected: `storno` already means "cancelled, no money moved", and `channel='comp'` already distinguishes the origin — a new enum value is a migration for zero analytical gain.
5. **Per-member cap enforced at issue.** Deferred: no stated need; reporting is observational and the admin uses judgment. A cap can be added later without schema change.
6. **Members as Payload `Users`.** Rejected: members never authenticate; adding logins would be pure overhead and a security surface for no benefit.

## Consequences

- **Pro:** A real goodwill workflow — issue free per-person tickets, attribute to a member, print or let the guest claim — reusing the partner channel, claim flow, PDF renderer, and void mechanism almost wholesale.
- **Pro:** Comps stay out of every money figure by construction, while still reconciling against capacity and counting at the door.
- **Pro:** Per-member reporting falls out of a `channel='comp'` + `GROUP BY member` read; no new stats infrastructure.
- **Con:** `Orders` gains a third channel and a second nullable attribution relationship (`member` alongside `partner`), widening the polymorphic-order surface that access control and stats must handle.
- **Con:** The `channel` enum widen touches the `00-base.sql` baseline (ADR-0013 drift-gate), not just an `ALTER` migration.
- **Con:** The per-show dashboard row and the season figures must be updated in lockstep with the new channel or the seat math visibly stops reconciling.

## Related

- ADR-0008 — Partner sales channel (the issue/claim/PDF/void machinery comps reuse; the `channel` discriminator pattern)
- ADR-0007 — Per-person tickets + `tickets` lifecycle (prerequisite; seat derivation and `storno` void)
- ADR-0006 — Three-tier admin roles (admin-tier gating for issue + Members CRUD)
- ADR-0013 — Schema management via bootstrap SQL + drift gate (enum widen must update the baseline)
- CONTEXT.md — "Channel", "Member (society member)", "Comp ticket"
