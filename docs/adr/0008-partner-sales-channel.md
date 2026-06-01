# ADR-0008: Partner sales channel

**Status:** Accepted
**Date:** 2026-06-01

## Context

Until now moreska.eu has had two ways tickets reach attendees: **online** (buyer pays via Stripe on the site → `Order` + tickets + PDF email) and **in-person** (a bare `inPersonSold` integer counter on `Shows`, no order, no artifact, no PII — the door cash tally).

The agency Kaleta (`docs/agency-brief.md`) needs a third path. They sell Moreška tickets through **their own POS at full face value** (€20 adult / €10 child), the buyer pays *them*, and at month-end HGD issues Kaleta an invoice for sales minus a **10% commission**. They want to issue tickets without typing buyer name/email each time (guests just want a printable QR), see their own sales statistics, and cancel mis-sold tickets the same day.

This is a non-Stripe, **issue-now / settle-monthly** channel that sits between online (paid up front, full PII) and in-person (no artifact, no PII). It needs the ticket-issuing machinery of online but the PII-light, payment-deferred shape of a reseller relationship. It also opens a question the other channels don't have: a partner ticket has no buyer email, yet HGD would like a way to reach attendees if a show is cancelled or moved.

Per-person tickets (ADR-0007) are a prerequisite — a reseller hands one slip per guest.

## Decision

### Partner as a first-class entity

New Payload **`Partners`** collection: name, billing/OIB details, **`commissionPercent`** (Kaleta = 10%), active flag, and one or more linked login users. Chosen over hardcoding Kaleta because commission is described per-partner and other resellers are plausible; adding a second partner becomes a CMS entry, not a code change. "Partner" over "agency" as the domain term — it covers any reseller.

### New `partner` role + scoped dashboard

Add `partner` to `Users.role`. A partner login links to one `Partners` record and lands on a **scoped `/admin` dashboard** (the ADR-0006 role-branching pattern, like tehnika): a sell form, their own stats, and their same-day storno list. Sidebar hidden; collection access scoped to their own data.

### Channel on `Orders`, not a separate collection

Extend `Orders` with **`channel`** (`online | partner`, default `online`) and a nullable **`partner`** relationship. `buyer_name`/`email` become nullable (a partner order has neither at sell time). Stripe PI stays null for partner orders; `total` records face value owed. This keeps **one** `tickets → orders → shows` join path so the door scan, stats, and PDF work uniformly — rejecting a separate `AgencySales` collection that would fork every join and the renderer.

### Sell flow

A partner picks an **active upcoming show**, enters adult + child counts, and gets the **combined 2-up A5 PDF** (ADR-0007) to print immediately. No PII, no Stripe, no email at sell time. Seats are guarded against **live remaining capacity** and the sell is rejected if it would oversell. Partner sells at **flat face value** — the online "every 5th free" discount does not apply.

### Seats derived from tickets; storno frees seats automatically

`remaining = VENUE_CAPACITY[venue] − COUNT(active tickets) − inPersonSold − legacyReserved`. The `onlineSold` counter is retired (the webhook stops incrementing it). `inPersonSold` and `legacyReserved` stay as counters — they represent seats with no `tickets` rows. Consequence: the **Stripe refund route must now void the order's tickets** (previously it only set `refund_status`), so a refunded seat frees itself.

### Storno

Partner self-service from their dashboard, **same calendar day of sale only** (Europe/Zagreb), server-enforced against `order.created_at` — never client-trusted. They may void an individual ticket or a whole sale. Admins may storno anytime. Voiding uses the soft-cancel mechanism (`tickets.status = cancelled`, `reason = storno`) from ADR-0007.

### Monthly reconciliation, not a fiscal invoice

The app produces a **per-partner monthly reconciliation statement** (tickets by show + type, cancelled count, gross, commission, net payable), bucketed by sold date and viewable/exportable by admin and the partner. The legal `račun` is issued by the secretary in their own accounting/fiscal tool. Generating a fiskalizacija-compliant invoice from the app was rejected — far larger scope and an ongoing tax-compliance burden for a small udruga.

### Optional buyer claim (PII captured later, by the guest)

Because partner orders have no email, the **end guest can optionally claim** their ticket. On the existing unauthenticated `/scan/[token]` buyer view (scanning never auto-writes), the page branches on whether the parent order already has an email:

- **Has email** (online, or partner already claimed): read-only — order code, show, party size, on-page QR, and the **masked** claimer email (`j***@gmail.com`).
- **Partner, unclaimed**: a **claim form** (name + email), **order-level first-claimer-wins** — sets `order.email`/`buyerName`, emails the digital ticket PDF, and enrols the order in show-change notices and (per consent) the post-show review email.

Claiming is orthogonal to money and seats; the ticket was already sold, counted, and invoiced.

### Comms & consent (consistent across channels)

Three classes: **transactional** (digital ticket — always), **operational** (cancellation / venue change — sent to any order with an email, no opt-in needed), and **post-show review** (**soft opt-in**: collection-time notice + unsubscribe link, no checkbox). The same rules apply to online and claimed-partner buyers. This also closes a pre-existing gap — the review email today has no unsubscribe link and checkout shows no consent notice.

### Order code

Every order (online and partner) carries a 4-char unambiguous-uppercase **code**, a human reference only — the per-ticket `token` remains the security boundary. Tickets are referenced `CODE-N`. See ADR-0007 / CONTEXT "Order code & ticket reference".

## Alternatives considered

1. **Stripe Connect / partner card through our Stripe.** Rejected: heavy integration, and the partner explicitly settles monthly by invoice, not per transaction.
2. **Reuse the `inPersonSold` counter, tagged by partner.** Rejected: produces no `tickets` rows, so it can't issue the per-person QR/PDF the partner needs, and can't drive per-partner stats.
3. **Separate `AgencySales` collection.** Rejected: forks every `tickets → orders` join (scan, scanned-people, drill-downs) and the PDF/stats code. The `channel` discriminator on `Orders` is far less surface.
4. **Hardcode Kaleta + a 10% constant.** Rejected: per-partner commission and plausible future resellers make a first-class `Partners` collection cheap insurance.
5. **App generates the fiscal invoice.** Rejected: fiskalizacija + e-invoicing compliance is disproportionate scope/risk; a reconciliation statement gives both sides verifiable numbers and leaves the legal document to the secretary's tool.
6. **Per-ticket claim (each guest their own email).** Rejected for now: more schema and a moved "has email?" check for marginal extra review reach; order-level first-claimer-wins matches how a POS rings up one group as one transaction.
7. **Marketing "info about the show" email.** Dropped: there is no such email; the captured address is for the ticket, operational show-change notices, and the one post-show review request only.

## Consequences

- **Pro:** A real reseller workflow — issue per-person tickets with no PII friction, see own stats, self-correct same day, settle monthly — without a payment integration.
- **Pro:** One join path and one PDF renderer across all three channels; partner data lands in the same stats naturally.
- **Pro:** The optional claim recovers attendee contact for show-change notices without forcing PII at the counter, and the consent rework makes the review email compliant for everyone.
- **Con:** `Orders` becomes polymorphic (nullable PII, channel-dependent invariants). Access control must scope a `partner` user to their own `Partners` record, orders, tickets, and reconciliation — a new predicate surface to test.
- **Con:** Retiring `onlineSold` and routing seats through `COUNT(tickets)` touches the webhook, refund route, `src/lib/shows.ts`, and the stats queries at once.
- **Con:** Same-day storno introduces a time-window rule (Europe/Zagreb) that must be enforced server-side and is easy to get wrong around midnight / DST.

## Related

- ADR-0007 — Per-person tickets + `tickets` rename (prerequisite; shares seat-derivation and lifecycle)
- ADR-0006 — Three-tier admin roles (role + scoped-dashboard pattern extended with `partner`)
- ADR-0005 — Ticket email + PDF presentation (the renderer the partner PDF reuses)
- ADR-0004 — Email infrastructure (Brevo sender identities for ticket/operational/review mail)
- CONTEXT.md — "Channel", "Partner", "Partner sell flow", "Partner monthly reconciliation", "Storno", "Ticket claim", "Buyer comms & consent"
