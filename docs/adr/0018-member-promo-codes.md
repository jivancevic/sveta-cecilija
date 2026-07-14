# ADR-0018: Member promo codes

**Status:** Accepted
**Date:** 2026-07-06

## Context

Society members want to give **special guests** a discounted ticket. The concrete ask: a member gets a code they hand out, the guest types it at online checkout, and an **adult ticket becomes €15** (vs the €20 face price). Admins must be able to **create** codes and **see how many tickets each code sold**. The codes should be **flexible** enough to grow into other discount shapes later.

Two mechanisms already touch price:

- The automatic **Free-ticket discount** (5-for-4): every 5th ticket in an order is free, applied unconditionally at online checkout (`src/lib/pricing.ts`).
- The **Partner channel** (ADR-0008): resellers sell at flat face value, monthly-invoiced — a first-class `Partners` collection attached to `Orders` via a `channel` field + relationship, with per-partner reporting scoped by that relationship.

The partner model is the near-exact structural analog for "an external entity whose sales we attribute and report on," so this ADR reuses its shape rather than inventing a new one.

The brief contained a tension worth recording: it said both *"members enroll to make a code for themselves"* and *"admin should be able to create a promo code."* Those imply very different scope (a member self-service portal + auth vs. admin-only creation). This ADR resolves it deliberately.

## Decision

### Admin-created, member-attributed — no member portal

Promo codes are created **only by admins** in the Payload admin. There is **no member login, no self-service enrollment, and no member-facing portal** in this work. The member asks the secretary, who creates the code. This rejects the "members enroll for themselves" reading of the brief as v1 scope — a member auth surface, enrollment/approval flow, and a scoped dashboard is a large, separate undertaking with no proven need yet. The data model is left portal-ready (a code already belongs to a member record) so a future portal can read the same tables without migration.

### New `PromoCodes` collection, attributed to a `Members` record

A new Payload **`PromoCodes`** collection: `code` (unique vanity text), a required **`member`** relationship, a `discountType` select, its parameter field(s), and an `active` flag. The `Members` collection is a **separate, parallel workstream** — this feature carries a hard dependency on it (the `member` relationship). A member may own more than one code.

### Discount modelled as a typed override, general engine deferred

`discountType` is a select whose **only v1 value is `adult-price-override`**, with an `adultPriceEur` parameter (default 15): the code overrides the **adult** price; **child stays €10**. A **general discount engine** (percent-off, per-type overrides, free-ticket rules, stacking policy) is explicitly **deferred** — adding a second shape means a new enum value + a new case in the pricing function, not a schema rewrite. This is the middle path between "one hardcoded field" (too rigid) and "build the engine now" (unnecessary surface for behavior that doesn't exist yet).

### Best-of-the-two pricing, server-enforced, non-stacking

An order with a code is charged the **lower** of (the code price) vs (the normal price *including* the Free-ticket discount). The two discounts do **not** stack; the guest is simply never worse off than the public offer. The pricing function keeps computing the standard 5-for-4 total and takes the `min`. Example: 5 adults with a code = `min(5×€15=€75, 4×€20=€80) = €75`.

The discount is **recomputed and validated server-side** in `createCheckoutSession` (never trusted from the client), the applied code travels in the Stripe PaymentIntent **metadata**, and the webhook resolves it to the `PromoCodes` record and stores a **`promoCode` relationship on the `Order`**. `order.total` still comes from Stripe's `amountReceived` (authoritative). An invalid/inactive code shows an inline error at checkout and the order proceeds at the normal price.

### Online checkout only

A code field lives on `/checkout`. **Partner POS (flat face value) and in-person sales are unaffected** and cannot carry a code. The code is **orthogonal to `channel`** — a promo-code order is still `channel = online`, not a fourth channel.

### Limits: an `active` toggle only (v1)

The only control in v1 is an **`active` on/off toggle** (like `Partners.active`) — an inactive code is rejected at checkout. **No usage cap, no expiry, no per-order cap.** The relationship is trust-based (a member vouches for their guests); the schema can grow these limits later if a code leaks.

### Reporting on the `/admin` dashboard

A **Promo codes panel** on the `/admin` dashboard shows the **top codes by tickets sold** with an **expand to show all** (reusing the partner "show 3 → show more" pattern). Per code it shows the member name, **tickets sold** and **revenue**. "Tickets sold" counts the **whole party** — every active ticket, adults *and* children, on any order that used the code (it measures the member's real draw, not just the discounted seats). Cancelled/refunded tickets are **excluded** and the number **self-heals** via the active-ticket count, exactly like the seat model and partner reconciliation. Follows the tested `getActiveTicketCountsByChannel` query seam, grouped by promo code instead of channel.

## Alternatives considered

1. **Member self-service portal (members log in, generate/view their own code + stats).** Rejected for v1: a whole new auth surface (member accounts, enrollment/approval, scoped dashboard) for a feature the org can run by having the secretary create codes. Model left portal-ready for later.
2. **Free-text member name on the code (no `Members` collection).** Rejected because a `Members` collection is already being built in parallel; linking to it enables per-member views and avoids duplicate identity data.
3. **Full discount engine now (rules/percent/fixed/per-type).** Rejected: significant code + tests for behaviors with no concrete requirement. Enum-with-one-value keeps the door open at near-zero cost.
4. **Stack the code with the 5-for-4 discount.** Rejected: two compounding discounts are hard to explain and can badly undercut revenue on large group codes. **Best-of-the-two** guarantees the guest the better of the two without stacking.
5. **A new `channel = promo` value.** Rejected: a promo order is still a Stripe-paid online order; the code is a separate axis. Overloading `channel` would fork channel-mix reporting and partner logic.
6. **Usage caps / expiry in v1.** Deferred: adds validation surface for a trust-based, low-volume perk. `active` alone covers the "kill a leaked code" case; caps are a cheap additive follow-up.
7. **Allow codes at the partner POS / in-person.** Rejected: partner sells at flat face value and in-person is a bare counter with no per-ticket rows to attribute a code to; online is the only channel guests use here.

## Consequences

- **Pro:** Reuses the proven partner-channel shape — a first-class collection + an `Orders` relationship + a grouped-count report — so scan, stats, and PDF paths are untouched and attribution "just works."
- **Pro:** Server-side recompute + PaymentIntent metadata keeps the discount unspoofable while leaving `order.total = amountReceived` as the single source of truth for money.
- **Pro:** Best-of-the-two means the pricing rule is monotonic and guest-friendly, and the code is a clean member perk rather than a bonus that compounds unpredictably.
- **Con:** Hard dependency on the parallel `Members` collection — this feature cannot ship until that relationship target exists (the two are filed as coordinated issues).
- **Con:** The online pricing path (`calculateOrderTotal` + `createCheckoutSession` + the webhook + the confirmation math) all learn about codes at once; the "best-of-two, non-stacking" rule must be enforced identically in the client preview and the server recompute or the shown total and the charged total diverge.
- **Con:** No usage cap means a leaked code can be used freely until an admin deactivates it — accepted for v1 as a trust-based, low-volume perk with the `active` kill-switch as the mitigation.

## Related

- ADR-0008 — Partner sales channel (structural analog: first-class entity + `Orders` relationship + scoped reporting)
- ADR-0007 — Per-person tickets (the active-ticket count that makes "tickets sold via code" self-heal on refund)
- ADR-0006 — Three-tier admin roles (admin-tier CRUD on the new collection; no new role added)
- CONTEXT.md — "Promo code", "Free-ticket discount", "Channel"
- Depends on: the `Members` collection (separate parallel workstream / issue)
