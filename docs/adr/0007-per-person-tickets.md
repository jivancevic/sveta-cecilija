# ADR-0007: Per-person tickets + `tickets` rename

**Status:** Accepted
**Date:** 2026-06-01

## Context

ADR-0005 and its 2026-05-26 amendment deliberately collapsed the ticket model to **one QR per order**: a single `qr_tokens` row per purchase, one A4 PDF page, and one scan admitting the entire party. The amendment's rationale was operational — door staff scanned once and waved everyone through, so N tokens per order produced trailing unscanned tokens and a "2 of 4 scanned" metric that looked buggy at the door.

The agency (Kaleta) brief (`docs/agency-brief.md`) reopens this. A reseller selling at their own POS hands a **physical paper slip to each guest**, and those guests may arrive at the door individually rather than as one phone-holding party. The agency explicitly asked for "one ticket per person," all bundled into **one PDF**, printed **2 tickets per A4** (A4-per-ticket is too large; they cut with a guillotine). They suggested this become the model for all tickets.

This forces a decision on ticket granularity that affects the data model, the door-scan flow, the "scanned people" metric, the PDF renderer, and the Stripe webhook.

A secondary naming problem surfaced in the same discussion: the collection is called `QRTokens` / table `qr_tokens`, an implementation-flavoured name. The QR is merely how a ticket is *presented*; the domain concept is a **ticket** (one admission for one person).

## Decision

### One QR per person, system-wide

Every **person** gets their own ticket row — both online and partner channels. A party of 4 produces 4 tickets, all linked to the same `Order`. The buyer/partner receives **one PDF** containing all tickets, laid out **2 per A4 page** (each ticket is A5). This applies uniformly so door semantics don't fork by channel.

The Stripe webhook (`handle-payment-succeeded.ts`) re-expands its write to create one ticket per person (reversing the amendment's collapse to a single insert). The partner sell flow creates the same per-person tickets.

### Door scan — each QR = 1 person, with optional party-admit

- Default: tehnika scans each person's ticket individually; each VALID scan admits exactly 1 person.
- Convenience: on a VALID scan, the result screen shows the order's party size and offers an **"Admit entire party (N)"** action that atomically marks all sibling tickets of the same `Order` scanned in one tap. The choice is the door staff's, per group. This preserves the "one scan walks the party in" speed that motivated the original amendment, without forcing it.
- The dashboard "Scanned (people)" metric becomes a plain `COUNT(*)` of scanned tickets for a show (each ticket = 1 person), replacing the `SUM(adult_count + child_count)` over scanned orders.

### `qr_tokens` → `tickets`, with per-ticket `type` and lifecycle

- The Payload collection `QRTokens` becomes `Tickets`; the table `qr_tokens` becomes `tickets`. All join chains (`tickets.order_id → orders.id → shows.id`), the scan logic, stats, and the PDF reader follow the rename.
- New column **`type`** (`adult | child`). Each ticket is self-describing: the A5 slip prints "Adult €20" / "Child €10", per-ticket storno can target a *specific* typed ticket, and counts derive cleanly (`adult_count = COUNT(tickets WHERE type='adult' AND status='active')`). This adopts ADR-0005 alternative #5, which was deferred until a per-seat operation existed — storno is now that operation.
- New lifecycle **`status`** (`active | cancelled`) + `cancelledAt` + `cancelReason` (`storno | refund`). A cancelled ticket is excluded from the active seat count, stats, and invoices, but still exists so a printed-but-voided slip scans to a clear CANCELLED state rather than vanishing.

### Seats derived from tickets

Sold seats are now `COUNT(active tickets for show)`, not a maintained `onlineSold` counter. See ADR-0008 for the full capacity formula and the refund/webhook consequences; the per-person model is what makes ticket-counting the natural source of truth (one row = one seat).

## Alternatives considered

1. **Keep one QR per order (status quo).** Rejected: cannot satisfy the partner's per-person paper-slip reality, and "one PDF, 2 per A4" only makes sense with multiple slips.
2. **Per-person QR for the partner channel only; online stays one-per-order.** Rejected: forks door semantics and the "scanned" metric by channel, and complicates the party-admit logic. Uniform per-person is simpler to reason about end to end.
3. **Per-person tokens but any one scan admits the whole order (tokens cosmetic).** Rejected: reverts "scanned" to order-level and makes per-person tokens decorative — muddier accounting for no gain. The optional party-admit gives the same door speed while keeping honest per-ticket state.
4. **Keep the `qr_tokens` name.** Rejected: the rename is cheap during a migration we're already doing, and "ticket" is the term every stakeholder uses.
5. **Keep adult/child only at order level (no per-ticket `type`).** Rejected: per-person + per-ticket storno needs to know *which* person's ticket was cancelled; an ordering convention ("first N are adults") is fragile once tickets are individually voided.

## Consequences

- **Pro:** Honest per-person attendance; the "scanned" number is a clean count. Self-describing tickets enable per-ticket storno and per-type invoicing.
- **Pro:** One uniform model and PDF layout across channels.
- **Con:** More scans at the door for online families on one phone (mitigated by the party-admit action). This is the exact friction the 2026-05-26 amendment removed; we accept it back in exchange for per-person correctness and the partner channel.
- **Con:** Schema migration: rename table, add `type` + lifecycle columns, backfill existing tickets (current prod tokens are test data; `db/schema/migrate-qr-truncate.sql` already exists). Webhook, refund route, scan logic, stats, and PDF all change.
- **Con:** A second documented reversal of the same decision. This ADR exists precisely so the flip-flop is explained: the original collapse optimised a single-channel (online) door flow; the partner channel introduced a physical reality that the collapse can't serve.

## Related

- ADR-0005 — Ticket email + PDF presentation (and its amendment, which this reverses)
- ADR-0008 — Partner sales channel (the driver; shares the seat-derivation and lifecycle decisions)
- ADR-0006 — Three-tier admin roles (the dashboard/role pattern reused for `partner`)
- CONTEXT.md — "One QR per person", "Ticket", "Seats sold / remaining capacity"
