# ADR-0011: Ticket PDF download auth model

**Status:** Accepted
**Date:** 2026-06-03

## Context

A buyer who pays online gets a ticket email with a one-click link to download
their tickets as a PDF (`GET /api/orders/[id]/tickets.pdf`). That endpoint serves
buyer PII (name, the show, and the live QR token that opens the door), so it must
not be world-readable by order id alone — order ids are small sequential integers,
trivially enumerable.

The link is currently authorised by an **HMAC-signed token** (`?t=...`) bound to
`orderId + buyer email` with a 7-day TTL (`src/lib/ticket-link.ts`,
`TICKET_LINK_SECRET`). The endpoint also accepts an authenticated admin/tehnika
cookie session as a second path (for door staff and support).

The link is minted fresh on every render of the (force-dynamic) confirmation
page, and the ticket email delivers the PDF as an *attachment* (no link in the
body). So a legitimate download always uses a seconds-old link; the TTL only
bounds how long a manually copied download URL stays live if it leaks. The TTL
was therefore tightened from 30 to 7 days — short leak window, zero UX cost,
since the link self-refreshes on each confirmation view.

This choice was made implicitly when the email-send flow was first built, never
weighed against alternatives. The question surfaced during grilling on a checkout
500 (`TICKET_LINK_SECRET is not set`): could a short human-readable order code
replace the long opaque signed token?

Separately — and this is the part that resolves most of the tension — the
per-person ticketing work (ADR-0007) and partner sales channel (ADR-0008) **already
introduced a human-readable order code**: `Orders.code`, a unique 4-character value
from an unambiguous uppercase alphabet (`src/lib/tickets/order-code.ts`), generated
at ticket issuance and printed on partner slips, read back at the door, and shown in
the ticket email and PDF. So the "no human reference" complaint against the signed
link is no longer true; the code exists. The only open question is what role, if
any, that code should play in **authorising the PDF download**.

## Options considered

1. **Status quo — HMAC link only.** ~256-bit signature bound to order + email,
   7-day TTL. Brute-force-resistant. Long ugly URL, needs a server secret.
2. **Short order code only.** Replace the signed token with `Orders.code` in the
   URL. The code's space is `31^4 ≈ 923k` — enumerable in minutes against an
   otherwise unauthed endpoint that returns the door QR. **Free tickets.** Rejected.
3. **Email as second factor.** URL carries the order id; buyer types/confirms their
   email to download. No server secret, but adds friction to every download and
   email addresses are low-entropy and often guessable. Rejected.
4. **Order code as a human reference + HMAC link for the endpoint.** Keep the signed
   link as the sole auth credential; use the order code purely as a *display and
   support* reference, never as an auth factor.

## Decision

**Adopt option 4, ratifying what the code already does.**

- The **HMAC-signed `?t=` link** (`src/lib/ticket-link.ts`) remains the only
  buyer-facing credential that authorises `GET /api/orders/[id]/tickets.pdf`. An
  authenticated admin/tehnika cookie session remains the staff path. Nothing about
  the auth model changes.
- **`Orders.code` is a display/reference value only.** It appears on the
  confirmation page, in the ticket email, on the PDF, and at the door scan view, and
  is what a buyer quotes to support. It is **never** sufficient on its own to
  download a PDF or open any PII endpoint.

### Invariant (the thing this ADR exists to protect)

> The order code must never gate the ticket PDF endpoint, or any endpoint that
> returns buyer PII or a door QR token.

At 4 characters the code is enumerable. It is safe precisely because it is not an
access credential. A future change that accepts `?code=` in lieu of the signed token
re-opens the free-tickets hole option 2 was rejected for. A regression test on the
PDF route asserts a code-only request is rejected, so this invariant fails loudly
rather than silently.

### Why not retire `TICKET_LINK_SECRET`

The secret is the one operational cost of this model, and the original 500 that
prompted the issue was a missing secret. We keep it: it is what makes the link
unforgeable, the failure mode is now understood (fail-fast on missing secret, env
documented), and every alternative that removes the secret is strictly weaker
(option 2) or worse UX (option 3).

## Consequences

- No change to the security posture or the email/PDF flow — this ADR mostly
  documents an already-correct implementation so it does not drift.
- Closes two small inconsistencies surfaced while writing it:
  - The **confirmation page** displayed the raw numeric `order.id` under "Order
    reference" while the email and PDF showed the friendly `order.code`. It now
    shows `order.code` so the buyer sees one consistent reference everywhere.
  - A **guardrail test** on the PDF route encodes the invariant above.
- `TICKET_LINK_SECRET` stays a required production secret (already in
  `.env.example`, set in Coolify).

## Not in scope

- A buyer-facing "lost my email" self-service re-download (code + email form). It
  would reintroduce a guessable-credential surface and is unnecessary while
  `OrderLookups` + admin resend cover the lost-email case. Revisit only if support
  volume warrants it, and only with rate-limiting and a longer code.
- The acute production fix (set the env var) — already done before this ADR.
