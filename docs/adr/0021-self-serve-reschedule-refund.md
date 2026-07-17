# ADR-0021: Self-serve refund on show reschedule

**Status:** Accepted
**Date:** 2026-07-17

## Context

When HGD moves a show to a new date (the reschedule flow — `src/lib/show-reschedule.ts`, `send-date-change-email.ts`), every online buyer's tickets are **automatically carried over** to the new date; nothing is required of them. But a minority genuinely can't make the new date. Until now the email's only escape hatch was *"reply to this email and we'll find a solution"* — a manual, staff-mediated refund (`POST /api/orders/[id]/refund`, admin-only).

We want the buyer to be able to **cancel and refund their own order without any staff intervention**, reached from a link in the reschedule email. Refunds are otherwise admin-only for good reason (they move real money and free seats), so opening a self-serve path needs deliberate scoping.

The refund engine (`refundOrder()` in `src/lib/refund-order.ts`) is already DI-clean, idempotent, and re-runnable (ADR-0008 voiding, stable Stripe idempotency key). The unsubscribe route already establishes a **stateless HMAC-token** pattern for unauthenticated public mutation (`src/lib/email/unsubscribe-token.ts`, keyed by `PAYLOAD_SECRET`).

## Decision

### The refund right is scoped to the reschedule event, not a standing capability

Self-serve refund exists **only because we changed the deal** by moving the buyer's date. It is **not** a general "cancel my order anytime" feature. The refund route re-checks server-side that the order's show was actually rescheduled (`shows.dateChangedAt IS NOT NULL`); a token for an order whose show was never moved cannot refund. A general self-serve cancellation (refund a sunny-day show the morning of, game the 5-for-4 math, etc.) is a much larger policy decision and explicitly out of scope here.

### Per-order HMAC token, no schema change

Identity is proven by a **per-order HMAC token** — `base64url(orderId).HMAC-SHA256(orderId, PAYLOAD_SECRET)` — mirroring the unsubscribe token exactly. Stateless (nothing stored, no migration), unguessable, verifiable on the server. Rejected: reusing the per-*ticket* QR scan token (it's the door-admission credential — overloading one secret with two very different powers is wrong) and an order-code + email form (the 4-char code is ~30⁴, printed on partner slips, brute-forceable). The token only proves *identity*; all *eligibility* is re-derived server-side, so the token carries no state and never expires.

### Eligibility keys on scan status, not a time window

A refund is allowed when: the show was rescheduled, `channel='online'` (has a Stripe PaymentIntent — comp is free, partner didn't pay us online), `refundStatus='none'`, and **no ticket in the order has been scanned**. There is **deliberately no time cutoff**: a no-show can still refund after the date has passed. The **scan is the proof-of-consumption** that closes the door, not the calendar — if the guest never came through the door, they never consumed the service. Consequence accepted: a buyer who simply forgot to attend can refund a week later. Refunds are **full-order only** (the whole order cancels, all sibling tickets void) — the engine has no partial-refund mode and we don't add one.

### A dedicated buyer page + a token-authed route, reusing the admin refund engine

- **Page:** `/order/[token]/refund`, outside the `(frontend)` route group with its own minimal branded layout (like `/scan/[token]`). Renders the order summary, a **secondary** (not dominant) "Cancel & refund" CTA, and an explicit confirm step before firing — the action is irreversible. Distinct states: eligible, already-refunded, not-eligible (scanned / non-online), invalid token. Bilingual via `orders.locale`.
- **Route:** `POST /api/order/[token]/refund` — verify token → **re-check every eligibility condition in the handler** (never trust the client) → call the existing `refundOrder()` engine (Stripe refund → mark refunded → void tickets → existing refund email). No new refund logic. Rate-limited per-token + per-IP, reusing the `/api/scan/[token]/claim` limiter precedent.

This is a **token/signature-authed public mutation** — the CLAUDE.md `requireRole` hard rule explicitly exempts this class (Stripe webhook, claim, unsubscribe, cron). It is a sanctioned exception, not a violation, because possession of an HMAC token bound to a specific order *is* the authorization.

### The reschedule email is rebuilt to the current brand standard

The old plain reschedule email is rebuilt to the review-email visual system (logo header, gold top rule, crossed-swords divider, near-black footer, Bodoni headings). It keeps the old→new date visual, **leads with reassurance** (tickets moved, still valid, nothing to do), then offers the escape hatch as a **secondary** CTA button to the refund page. The *"reply to us and we'll find a solution"* line is **dropped** — the self-serve link is the solution, and re-advertising a manual reply reintroduces the staff intervention this ADR removes. `Reply-To: info@moreska.eu` stays for genuine oddball cases; it just isn't advertised.

## Consequences

- A leaked reschedule email link lets its holder refund that one order. Mitigated by the ~256-bit HMAC (unguessable), rate limiting, and the fact that a refund only ever returns money to the original card — there is no exfiltration of funds, only self-cancellation.
- The feature must be deployed to prod **before** any reschedule email that links to it is sent, or buyers get a 404. Rollout is sequenced: build → merge → deploy → prod test-send + end-to-end click → only then the real buyer blast.
