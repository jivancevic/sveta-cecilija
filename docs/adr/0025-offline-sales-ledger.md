# ADR-0025: Offline sales ledger (door + legacy), with per-line discounts

**Status:** Accepted
**Date:** 2026-09-12

## Context

Three ways tickets reach attendees produce an `Order` and per-person `Tickets`: **online** (Stripe), **partner** (ADR-0008) and **comp** (ADR-0019). Two do not:

- **Door sales** — cash or card taken at the entrance, no QR, no PII. Modelled since the beginning as a bare integer counter `shows.in_person_sold`.
- **Legacy sales** — seats sold on the old WordPress/Tickera site before the 2026-06-07 cutover. Modelled as a second bare counter `shows.legacy_reserved`.

Both counters are subtracted from venue capacity by the single seat formula (`remainingSeats`). Neither carries a ticket type, a price, or a reason.

The 2026 season exposed what that costs. The secretary's tally (`2026.Karte na ulazu.odt`) holds fifteen nights of door sales with an adult/child split and one group discount, and **none of it could be entered**: `in_person_sold` is one number per show and was still `0` on all 22 performances at season end. Concretely:

- **704 seats and ~€13,390** of door revenue were invisible.
- **137 seats and €2,710** sold on the legacy site for 18.05 and 25.05 were invisible; those two performances hold zero `tickets` rows, so the dashboard showed an empty house on two sold evenings.
- 53 of the door seats were **children**, but "Revenue collected" valued every door seat at a flat €20 (`IN_PERSON_PRICE_CENTS`), overstating by €530.
- 32 were **pensioners who paid €15** under a group discount. A counter cannot express "an adult ticket, discounted".

The obvious fix — a third price category ("senior") — was rejected by the org. The requirement is explicitly *"the ticket stays an adult ticket, and it carries a discount that explains why it cost less"*, so that a future promo-coded sale reads the same way. That matches the industry norm, where a small set of price categories is one axis and discounts are a separate axis applied on top.

Note that **member promo codes already exist** (ADR-0018) and already produce a €15 adult ticket online. What is missing is not a discount mechanism but the ability to record a discount *on the sale line*, in the one channel that has no order at all.

## Decision

### One ledger for both artifact-less channels

New raw table **`offline_sales`** (not a Payload collection — see alternatives), one row per *line* of a sale:

```
id, show_id → shows, source ('door' | 'legacy'), ticket_type ('adult' | 'child'),
quantity (≠ 0), unit_price_cents, discount_label (NULL = full price),
note, created_by_id → users, created_at
```

An **offline sale** is a sale that produced no `Order` and no `Ticket` in this system and is therefore recorded as a counted line rather than as per-person rows. Its two sources are the door and the legacy site. Door and legacy are unified because they are the same shape of fact and both needed the same three things the counters lacked: a type, a price, and a reason.

The 08.06 evening becomes two lines: `68 × adult @ €20` and `32 × adult @ €15, discount_label = 'umirovljenici (grupni popust)'`. The ticket type stays `adult` in both, which is exactly the requirement.

### Append-only; corrections are negative lines

`quantity` may be negative and rows are never updated or deleted. A miscount is fixed by appending the inverse line, which leaves the mistake and its correction both visible. This replaces the old write path, which accepted only positive integers and had **no way to undo a typo** short of hand-editing the field in the admin. Given the source tally is hand-kept and did not internally reconcile (its adult column summed to 619 against a typed total of 599), a correction path is not optional.

Two things keep a correction from quietly moving money. First, a batch may not drive any **(ticket type, unit price)** group negative: you can only take back what was actually put in, at the price it was put in at, which also stops one type's correction cancelling another type's seats. Second, the entry panel **lists the lines already recorded**. The guard can prove a total stays possible but cannot know *which* line the operator meant to undo, and the failure is silent: undo 32 pensioners at €15 through the €20 adult box and the performance keeps the same seat count while losing €160, with nothing on any screen to notice it by. Correcting against something visible is the real defence; the guard is the backstop.

### Prices live on the line, not in code

`unit_price_cents` is resolved at write time and stored. Face-value lines take it from the existing `ADULT_PRICE_EUR` / `CHILD_PRICE_EUR` constants; a discounted line stores the price actually charged. History therefore cannot be rewritten by a future price change. This is a deliberate, local exception to "ticket prices are fixed in code": the constants remain the source of truth for *what to charge*, while the ledger records *what was charged*.

### The counters stay, as a denormalised cache

`shows.in_person_sold` and `shows.legacy_reserved` are kept and maintained in the same transaction as the ledger insert, via the atomic `col = col + $1` pattern:

```
in_person_sold  = SUM(quantity) WHERE source = 'door'
legacy_reserved = SUM(quantity) WHERE source = 'legacy'
```

Every existing reader of the seat formula keeps working untouched and capacity math does not move. Only the *money* and *split* readers switch to the ledger. Dropping the counters and deriving everything would have touched eight call sites of `remainingSeats` for no capacity benefit.

### Revenue and the adult/child split come from the ledger

"Revenue collected" stops multiplying a headcount by a flat €20 and instead sums `quantity × unit_price_cents`. The member dashboard's *"box office tickets are not split into adult / child"* caveat is removed, because now they are.

Legacy seats **count as sold** on every dashboard. They were completed sales on a closed system, not reservations; the secretary dashboard previously excluded them from "Tickets sold" while the member dashboard included them, and that disagreement ends. Their revenue is real and reconcilable, since the legacy site charged the same €20/€10 and settled into the same Stripe account.

### Venue capacity for Ljetno kino corrected to 350

The recorded 320 was wrong. The house holds 350. With 350, no 2026 evening exceeds capacity; the fullest, 06.08, reaches 339. Under 320 two August evenings would have read as impossible.

**Accepted risk:** online may now sell all 350, and door sales are entered after the fact, so nothing reserves seats for walk-ups in real time. The org owns this trade-off knowingly.

### Naming

Croatian **"Na ulazu"**, English **"At the door"**, replacing the inconsistent *Na blagajni* / *Blagajna* / *In person* / *Box office*. There is no box office; people pay at the entrance. `door` remains the *permission* name for scanner staff, a different axis; the channel-shaped concept is never called `door` in user-facing text.

## Alternatives considered

1. **A fourth `orders.channel` with real `Orders` + `Tickets`.** Rejected. No per-person data exists for a season-end tally, so it would fabricate ~700 tickets carrying QR tokens that were never issued and can never be scanned, collapsing the scanned percentage on fifteen evenings and flooding each show's order table with buyer-less rows. Fiscalization (#297) will need a receipt written *at the moment of sale*, which a backfilled channel cannot retrofit anyway.
2. **A third price category, "senior" / "concession" @ €15.** Rejected by the org: the seat sold is an adult seat, and a category would multiply as every new discount shape appears. The discount belongs on the line, not in the type vocabulary.
3. **A third counter for discounted adults.** Rejected: same objection as (2), plus it hardcodes one price and generalises to nothing.
4. **Keep one counter, split it into `in_person_adult` / `in_person_child`.** This was the original decision and it was reversed mid-design: two integers still cannot carry a discount, which was the requirement that arrived next.
5. **A Payload collection instead of a raw table.** Rejected for now: it would force a `00-base.sql` regeneration and a drift-gate pass for a table with a purpose-built entry UI and no need for generic admin CRUD. Precedent for raw tables: `marketing_optouts`, `push_subscriptions`, `oauth_codes`.
6. **Derive the counters and drop the columns.** Rejected as unnecessary churn across eight `remainingSeats` call sites; the cache is maintained transactionally and its invariant is stated above.
7. **Per-ticket discounts across every channel now** (moving the promo code from the order to the ticket). Deferred to its own decision: it touches pricing, refunds and the live promo-code path, and does not need to block recording the 2026 numbers.

## Consequences

- **Pro:** 841 previously invisible seats and ~€16,100 of real revenue enter the dashboard, with an exact adult/child split and exact money.
- **Pro:** A discount is recordable without inventing a price category, and the ledger shape already fits the deferred per-ticket discount work.
- **Pro:** Corrections are possible and auditable for the first time.
- **Con:** Two representations of the same seats now exist, the ledger and the cached counters. The invariant is stated here and covered by tests; a future writer who updates one without the other breaks it.
- **Con:** `offline_sales` is invisible in the Payload admin, so a repair outside the entry UI means SQL. Nothing yet renders an individual line, so the audit trail is readable only by query.
- **Con:** the Shows `beforeValidate` hook zeroes both counters when a performance is made non-public (#409) and knows nothing about the ledger, so that one path can still orphan lines. The counters are `readOnly` in the admin to keep it the only such path, and the backfill script's recompute rebuilds them.
- **Con:** Raising capacity to 350 removes the accidental 30-seat walk-up buffer that 320 was providing.
