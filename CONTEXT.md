# CONTEXT.md — HGD Sveta Cecilija / moreska.eu

## Glossary

### URL structure
No locale prefixes in URLs. `/tickets`, `/about`, etc. — not `/en/tickets`. The `[locale]` folder routing is removed. Language is resolved on first visit from `accept-language` headers (Croatian browsers → HR, everything else → EN) and persisted in a cookie (`moreska_locale`). The language switcher updates the cookie and reloads the same URL. Server reads the cookie on each request to pick translations.

**SEO consequence:** Because Googlebot doesn't carry cookies, each URL is indexable in only one language (whichever the server defaults to for Googlebot's `Accept-Language`). Decision: **SEO is scoped to English only.** Croatian content exists for visitors who switch the language but is not targeted for search ranking. No `hreflang` tags. If German/Italian content is added later, it will be in-page for users but not SEO-optimised under this URL scheme. Action item: ensure `src/proxy.ts` serves **EN** to requests with no cookie (Googlebot default) — including any UA-sniffing path.

### Language switcher
Always renders `HR · EN` (fixed order, HR left). Active language shown in a distinct colour (gold); inactive is dimmed. Switching: save `window.scrollY` to `sessionStorage`, set `moreska_locale` cookie, reload — on mount, read `sessionStorage` and `window.scrollTo` to restore position.

### Venues
Two venues are used. Capacity is fixed per venue — no per-show overrides.

| Venue | Croatian name | Capacity | Typical use |
|---|---|---|---|
| Admin value | Croatian (public) | English (public) | Capacity | Notes |
|---|---|---|---|---|
| `ljetno-kino` | Ljetno kino | Summer Cinema | 350 | Default for all public ticketed shows |
| `zimsko-kino` | Centar za kulturu | Cultural Center Korčula | 250 | Same building as Zimsko kino. Used for private/tour-operator shows; fallback when bad weather forces a move indoors |

Venue is exposed on the public-facing `Show` type — a `Redovna` show may be moved to Zimsko kino due to bad weather, and ticket buyers must see this.

**Public tickets page — venue info block (top of page):**
Static note: "Performances are held at the Summer Cinema. In case of bad weather, performances move to the Korčula Culture Centre." Always shown regardless of which shows are listed below.

**Show cards:** Venue name displayed on every card. When a show is moved to the bad-weather venue, the card reflects this — buyers see it immediately without having to notice a badge.

Other venue block details (always shown):
- Google Maps link for Summer Cinema (https://maps.app.goo.gl/bVYpoQAHw6sixyYk9)
- Show duration: 1 hour
- Programme order: klapa performance first, then Moreška with live wind orchestra

### Show time format
Stored and displayed as `HH:MM` (24-hour, e.g. `21:00`, `10:30`). Validated on input — the admin rejects any value that doesn't match the pattern. No predefined pick-list; free text with format enforcement.

### 2026 season
22 Redovna shows from 2026-05-18 to 2026-10-14, all at `ljetno-kino`, all 21:00. Seeded into the `shows` collection via `db/schema/seed-shows.sql` (idempotent `WHERE NOT EXISTS` guard). The other 14 rows of the 36-row season (Adriatic DMC charter shows on cruise ships like Le Ponant / Le Bougainville / NG Orion / Lady Eleganza, Gulliver group tours, KONCERT at Sv. Justina, and the Sv. Todor pilgrimage performance) are **also in the `shows` table** since #411 (ADR-0024 phase 2), as non-public performances (`isPublic = false`, `kind` other than `redovna`), seeded by `db/schema/seed-zz-nonpublic-performances.sql`. They carry a free-text `location` and `client` instead of a venue, sell nothing, and never reach `/tickets`, the door or a ticket statistic. `docs/performances.md` is now a frozen historical print; the database is the source of truth.

### Performance visibility
Only performances whose date >= today (YYYY-MM-DD, compared at midnight) are shown on the tickets page. Today's show is always visible; it disappears when the next calendar day begins.

### Performance photos
Only Moreška photos are used on the tickets page. `klapa.jpg` and `band01.jpg` are excluded from the performance card image rotation.

### Brand layers
Two names, used in different contexts. See [ADR-0003](../docs/adr/0003-brand-layer.md).

- **Legal entity:** **HGD Sveta Cecilija** — use in footer copyright, invoices, contracts, Payload User records, formal correspondence.
- **Consumer-facing brand:** **Moreška by HGD Sveta Cecilija** — use in page titles, OG/meta, ad copy, social bios, Google Business Profile name, hero subtitles.
- **Tagline:** **"The Original Moreška, performed since 1883"** — for ad copy, meta descriptions, hero subtitle.
- **Schema.org Organization:** `name: "HGD Sveta Cecilija"`, `alternateName: "Moreška by HGD Sveta Cecilija"`.

Reason: competitor `moreska.hr` owns the "Moreška Korčula" experience keyword in search. The brand layer reclaims share of voice while preserving the 143-year heritage differentiator.

### Product surfaces: Cecilija / Web / Backoffice
The society runs three software surfaces, each with exactly one name (decided in [Cecilija: rebrand surfaces](https://github.com/jivancevic/sveta-cecilija/issues/477), map #471; recorded in [ADR-0027](docs/adr/0027-cecilija-one-staff-app-payload-backoffice.md)):

- **Cecilija**: the staff and member app at `/app`. Everyone who works for or dances in the society uses it: the secretary, the door crew, partners, voditelji and moreškanti. It replaces both the old *Moreškant* app name and, screen by screen, the Backoffice as a daily tool.
- **Web**: the public site at `moreska.eu`, where visitors read about the society and buy tickets.
- **Backoffice**: the raw-edit administration behind the `dev` permission (the Payload admin at `/admin`), which an `editor` also opens, for Objave and FAQ only. Once Cecilija covers a screen, nobody but the developer opens the Backoffice for it.

_Avoid_: **admin** as a name for any surface. For months it would mean both the Backoffice and the new app; say Cecilija or Backoffice. **Moreškant** is no longer the name of an app: it names a person and a section of Cecilija (see below).

**Rename rule (Moreškant → Cecilija):** anything named after the *product* takes the name Cecilija (the app title, its icon, its install and sign-in copy, its account mails, its home-screen entry). Anything named after the *section* or the *person* keeps "moreškant" (the permissions, the dancer profile, the roster's tab, the roster's alarm). When in doubt ask "is this the app, or the dancers?".

**Declension:** "Cecilija" is a Croatian feminine noun and declines like a name in every text: "Dodaj Ceciliju na ekran", "Prijavi se u Ceciliju", "Pozivnica za Ceciliju", "u Ceciliji". Never keep it invariant as if it were a foreign brand. English copy, if any, keeps "Cecilija" unchanged.

### Screen (ekran) and landing screen (ulazni ekran)
A screen is one place in Cecilija with one address and one Croatian label (Narudžbe, Izvedbe, Ljestvica, Skener, Prodaja, Obračun, Upiti, Gratis, Korisnici, Statistika, Više). A permission unlocks screens; an account is inside Cecilija when its permissions unlock at least one, and the **landing screen** is the first of them in the bar order. Izvedbe is one screen for everyone who has it: what it shows depends on the permissions, never on a second address. Statistika is the sales screen; dancer statistics live on *Ljestvica*.
_Avoid_: page, view, module, "admin screen".

### Nemate pristup (no access)
What a signed-in account sees when its permissions unlock no screen, or when it opens a screen it does not unlock: the sentence naming the situation, a way back to the landing screen, and Odjava. Never a silent redirect and never a "not found". The Backoffice link appears only for a `dev` holder.

### Sandučić obavijesti (notification inbox)
Every notification Cecilija sends a person is also kept for them to read later ([ADR-0027](docs/adr/0027-cecilija-one-staff-app-payload-backoffice.md) narrows ADR-0024: push stays the only way a notification is *delivered*, the inbox is where every one of them is *kept*): a bell in the header of every screen shows how many are unread, and the inbox lists them. Kept per account, not per device, so the count is the same on the phone and the laptop. Roster notifications (see *Notification types*) go to moreškanti and voditelji; a `tickets` holder also gets a new inquiry and a new card dispute, never every order.
_Avoid_: feed, activity log, message centre.

### Croatian capitalisation: moreška
"moreška" and its declensions (moreške, morešku, moreškom…) are always **lowercase** in Croatian — it is a common noun (a type of dance), not a proper name. Use uppercase only when it is the **leading word of a unit that is sentence-cased**: the start of a sentence, or the first word of a standalone title / heading / card-name label (a card whose name is "Moreška" or "Moreška iskustvo"). Keep it lowercase **mid-sentence, mid-title** (e.g. "Privatna moreška", "Nastanak moreške"), and in **mid-list descriptor fragments** (e.g. the programme note "1 sat · nastup klape · moreška uz živi puhaći orkestar" — not a title). In English, "Moreška" is treated as a proper name and capitalised throughout, so a `name` field reads "Moreška" in `en.json` but "moreška" mid-phrase in `hr.json` by design — that EN↔HR asymmetry is correct, not a bug.

### Dancer noun: moreškant
A performer of the moreška is a **moreškant** (pl. **moreškanti**, gen. pl. **moreškanata**; adjective **moreškantski**, e.g. "moreškantska sezona", "moreškantski ansambl"). **"Moreškar" and its derivations are wrong and must never appear in copy** — it is a common outsider coinage, and the society uses `moreškant` for its own dancers. Applies to `src/messages/hr.json`, HR copy docs, marketing templates, posters and email. English copy currently says "dancers" and needs no change; if the Croatian term is ever used in EN, keep it as `moreškant`/`moreškanti`. Sweep for regressions **case-insensitively** (`grep -rniE "more[sš]k[ao]r"`) — the capitalised sentence-initial form is easy to miss otherwise.

### Event noun: Performance / izvedba
One scheduled moreška event has a **single canonical user-facing noun in each language**, used everywhere (public site + admin + partner): **English "Performance"**, **Croatian "izvedba"**. Chosen for EN↔HR register parity (izvedba is the true cognate of "Performance"), for matching a 143-year cultural institution's voice over a casual "show/gig", and because every event is a *rendition of the one canonical traditional work* — which "izvedba" captures precisely.
- **Retired as the event noun:** EN "Show", HR "predstava" and "nastup". Align any user-facing occurrences to Performance / izvedba.
- **Still allowed:** the **verb** ("grupa nastupa / izvodi morešku"); the **idiom** "Showtime 21:00"; the internal **DB type/collection `Show`/`shows`** (not user-facing — do NOT rename); and **"Moreška"** as the proper-noun brand/the dance itself ("the next Moreška performance" — brand noun + generic noun stack, they don't compete). "Izvedba" was already the artistic/private-context word ("Privatne izvedbe", "prva poznata izvedba"); it now becomes universal, so that copy already fits.
- _Avoid (HR):_ predstava, nastup (as the event noun). _Avoid (EN):_ Show (as the event noun).

### Offline sale (at the door / legacy)
A sale that produced **no `Order` and no `Ticket` row** in this system, and is therefore recorded as a **counted line** rather than as per-person rows. Two sources, one ledger (`offline_sales`, a raw table — see [ADR-0025](../docs/adr/0025-offline-sales-ledger.md)):

- **`door`** — paid at the entrance on the night. Croatian **"Na ulazu"**, English **"At the door"**. (Never called *box office* or *na blagajni*: there is no box office. `door` is also the *permission* name for scanner staff, a different axis, so the user-facing text never uses the bare word.)
- **`legacy`** — sold on the previous site (`korcula-moreska.com`, WordPress + Tickera) before the 2026-06-07 cutover. Final and closed; the old store sells nothing.

Each line carries a **ticket type** (`adult | child`, the same two the rest of the system uses), a **quantity**, the **unit price actually charged**, and an optional **discount label** explaining why that price is below face value. A discounted seat keeps its real type: 32 pensioners at €15 are *adult* lines with a discount label, **not** a third price category. Prices are stored on the line so a later price change cannot rewrite history.

The ledger is **append-only**. A miscount is corrected by appending the inverse line (negative `quantity`), never by editing or deleting, so the error and its correction both stay visible.

Legacy seats **count as sold** everywhere. They were completed sales on a closed system, not reservations, and their money is real (the legacy site charged the same €20/€10 into the same Stripe account).

**Cached counters.** `shows.inPersonSold` and `shows.legacyReserved` survive as a denormalised cache of the ledger, maintained in the same transaction as the insert:

`inPersonSold = SUM(quantity) WHERE source='door'` · `legacyReserved = SUM(quantity) WHERE source='legacy'`

They exist so the seat formula and its eight call sites keep working unchanged. Money and the adult/child split are read from the **ledger**, never from the counters.

### Seats sold / remaining capacity
Source of truth for sold seats is the **`tickets` table**, not maintained counters. Each active ticket = one seat. The `onlineSold` counter (and any per-partner counter) is **retired**:

`remaining = VENUE_CAPACITY[venue] − COUNT(active tickets for show) − inPersonSold − legacyReserved`

- `inPersonSold` and `legacyReserved` stay counters — they are the **cached totals of the offline sales ledger** (see *Offline sale*), covering seats that produce no `tickets` rows. Capacity reads the counters; money and the adult/child split read the ledger.
- A **cancelled** ticket (partner storno, or an online refund) is excluded from the active count, so the seat frees itself with no counter to decrement. This requires a ticket lifecycle state (see Ticket) — voiding is the single mechanism behind both storno and refund.
- Consequence: the Stripe refund route must now **void the order's tickets** (previously it only set `order.refund_status`), and the webhook no longer increments `onlineSold`. Stats reads that summed `onlineSold` switch to counting tickets.

**Oversell serialization (#179):** counting active tickets and then inserting are separate steps, so concurrent sells of the last seats could both pass the guard and oversell. The `count → capacity-check → insert` critical section is serialized per show by a **Postgres advisory lock** keyed on the show id (`src/lib/tickets/sell-lock.ts`, `withShowSellLock`), wired into both the **partner sell** (`createPartnerSale`, rejects cleanly on oversell) and the **online webhook** insert (`handlePaymentSucceeded` — post-payment, so it never rejects; the lock keeps the count consistent across channels, and the pre-payment guard in `checkout.ts` remains the online defense). Different shows use different lock keys → no contention, no deadlock. Proven under real concurrency by `scripts/probe-oversell.mjs` (20 sells racing for 3 seats → exactly 3 with the lock; oversells without it).

### Purchasability
Whether a given **online** purchase is valid *right now*: the order is non-empty, the show is `active` and still in the future, and the requested seats fit the live remaining capacity. This is the online-checkout concern only — the partner sell flow has its own rules (active upcoming show, positive counts) and does not share these. The seat-fit part is delegated to the shared seat-availability seam (see *Seats sold / remaining capacity*); purchasability owns the empty/cancelled/paused/past rules and the typed error modes (`EMPTY | CANCELLED | SALES_PAUSED | PAST | OVER_CAPACITY`). Lives in `src/lib/checkout/purchasability.ts` (`assertPurchasable`, `CheckoutValidationError`); the canonical seat math is `src/lib/tickets/seat-availability.ts` (`remainingSeats`, `assertCanSell`). The `shows.online_sold` counter is retired — the seat input is the live active-ticket count, named `activeTicketCount` everywhere it is passed.

### Online sales pause
An admin toggle on one show that closes the **online** sales channel only. A paused show stays publicly listed with an "online sales closed" note (it is not cancelled and not hidden); partner sells, comp tickets, door scanning and stats are unaffected. Pausing applies to new purchase attempts — a payment already in flight completes normally. Distinct from *cancelled* (show doesn't happen) and *sold out* (no seats left).


### Show cancellation
Withdrawing a public performance that will not happen. Decided in [#497](https://github.com/jivancevic/sveta-cecilija/issues/497) (2026-09-12): cancelling **refunds every online order in full automatically** through the idempotent refund engine and emails every buyer, voids partner tickets as storno (the seats leave the monthly statement) and comp tickets likewise, and is done by a `refunds` holder. A non-public performance is simply marked cancelled: nothing to refund, nobody to tell. Distinct from *Online sales pause* (the show still happens) and from *Self-serve reschedule refund* (the show moved, the buyer chooses).
_Avoid_: "cancel" for a single ticket (that is a *storno* or a *refund*).
### Free-ticket discount
Every 5th ticket in a single order is free. The free ticket's type matches the most expensive category present in the order: adult (€20) if any adult tickets were purchased, otherwise child (€10).

Discount formula: `floor(totalTickets / 5) × (hasAdult ? 20 : 10)`

Examples:
- 4 adults + 1 child = 5 tickets → €20 off
- 5 children = 5 tickets → €10 off
- 10 adults = 10 tickets → €40 off

The discount is calculated per order (resets with each new purchase — no cross-order loyalty tracking).

**UX — two-stage notification in the booking panel:**
1. At 4 tickets (one short of threshold): nudge — "Add 1 more and get one free!"
2. At a multiple of 5: celebrate — "You've unlocked a free ticket!" + update total visually.

### Promo code
A **code-entered** discount applied at online checkout, distinct from the automatic *Free-ticket discount* (5-for-4) above. A society member is given a promo code (attributed to them) which they hand to special guests; the guest types it on `/checkout` and gets a member price. See [ADR-0018](../docs/adr/0018-member-promo-codes.md).

- **Who creates them:** **admin only**, in the Payload admin. There is **no member self-service portal and no member login** — the member asks the secretary, who creates the code and attributes it to a `Members` record (the `Members` collection is a separate, parallel workstream; a promo code carries a required `member` relationship into it). A member may have more than one code.
- **What the default code does:** overrides the **adult** price to **€15** (child stays €10). Modelled as a `discountType` select whose only v1 value is `adult-price-override` (+ an `adultPriceEur` parameter, default 15). A **general discount engine** (percent-off, per-type overrides, free-ticket rules) is explicitly **deferred** — add a new enum value + a pricing case when a concrete second code type exists.
- **Best-of-the-two pricing (server-enforced):** an order with a code is charged the **lower** of (the code price) vs (the normal price *with* the Free-ticket discount), so a guest is never worse off than the public offer. The pricing function keeps computing the standard 5-for-4 total and takes the min. The two discounts do **not** stack. Example: 5 adults with a code = min(5×€15=€75, 4×€20=€80) = **€75**.
- **Limits (v1):** only an **`active` on/off toggle** (like `Partners.active`) — an inactive code is rejected at checkout. **No** usage cap, expiry, or per-order cap in v1 (trust-based; the schema can grow if a code leaks).
- **Entry point:** **online checkout only.** Partner POS (flat face value) and in-person sales are unaffected and cannot carry a code.
- **Attribution:** the applied code is validated and priced **server-side** (`createCheckoutSession`), passed through Stripe PaymentIntent metadata, and the resolved code is stored as a `promoCode` relationship on the `Order` by the webhook. `order.total` still comes from Stripe's `amountReceived` (trusted). A code is a text vanity string (e.g. `MARKO15`), stored trimmed/uppercased, unique, matched case-insensitively; an invalid/inactive code shows an inline error at checkout and the order proceeds at the normal price.
- **Reporting ("how many tickets sold using that code"):** a **Promo codes panel on the `/admin` dashboard** shows the **top codes by tickets sold** with an **expand to show all** (the partner "show 3 → show more" pattern). Per code: member name, **tickets sold = COUNT of the whole party** (every active ticket — adults *and* children — on any order that used the code) and **revenue** = money collected on those orders. Cancelled/refunded tickets are **excluded** (self-heals via the active-ticket count, like the seat model and partner reconciliation).
- **Orthogonal to channel:** a promo-code order is still `channel = online`; the code is a separate axis, not a fourth channel.

### One QR per person (system-wide)
Each **person** gets their own `Tickets` row — applies to **both** online and partner channels. A party of 4 produces 4 tickets, all linked to the same `Order`. The buyer/partner receives **one PDF** containing all tickets, laid out **2 tickets per A4 page** (each ticket is A5; the partner cuts them apart with a guillotine; A4-per-ticket was too large). Each ticket carries its own `type` (adult/child) and scan state.

This **re-reverses** the earlier "one QR per order" amendment to ADR-0005 (which had collapsed N tokens to 1). Reason for the re-reversal: the partner channel hands a physical paper slip to each guest, who may arrive individually, so per-person scanning is the physical reality; applying it system-wide keeps door semantics uniform across channels and the "scanned" metric becomes a clean per-ticket count.

**Door scan — each QR = 1 person, with an optional party-admit:**
- Default: tehnika scans each person's ticket individually; each VALID scan admits exactly 1 person.
- Convenience: on a VALID scan, the result screen shows the order's party size and offers an **"Admit entire party (N)"** action that atomically marks all sibling tickets of the same `Order` scanned in one tap. The choice is the door staff's, per group.
- "Scanned (people)" on the dashboard becomes `COUNT(*)` of scanned tickets for the show (each ticket = 1 person) — no longer a `SUM(adult_count + child_count)` over scanned orders.

The write path in `handle-payment-succeeded.ts` re-expands to create one ticket per person; the partner sell-flow creates the same per-person tickets.

### One QR per order (SUPERSEDED)
The prior model — exactly one `QRTokens` row per order, one A4 page, one scan admits the whole party — is **superseded** by "One QR per person" above. Kept here as a pointer; the rationale (simpler artefact, one-scan party admit) is partly preserved via the optional party-admit action.

### Ticket claim (partner tickets)
Partners sell without collecting buyer PII, but the **end guest can optionally claim** their ticket to get a digital copy + show comms. The claim lives in the existing **unauthenticated** `/scan/[token]` buyer-view branch (scanning never auto-writes; claiming is a deliberate form submit). When an unauthenticated visitor opens a ticket's QR page, the page branches on whether the parent order already has an email:

- **Order has an email** (online order, or a partner order already claimed): read-only info — order **code**, which show, party size, and the on-page QR to show at the door. Also shows **who claimed it**, with the email **masked** (`j***@gmail.com`) so a lost slip doesn't leak a full address. No write.
- **Partner order with no email yet** (unclaimed): a **claim form** (name + email). On submit it is **order-level, first-claimer-wins** — sets `order.email`/`buyerName`, emails the claimer the order's digital ticket PDF, and (with explicit opt-in) enrolls the order in pre-show info + post-show emails. Subsequent scans of sibling tickets fall into the read-only branch above.

Claiming is orthogonal to money and seats — the ticket was already sold, counted, and invoiced to the partner; claim only attaches contact info. Tehnika (authenticated) scanning an unclaimed partner ticket still just admits — no claim form for staff.

**The printed partner slip advertises the claim** so the guest knows the option exists: a **dedicated tinted note band** ("Get a digital ticket + show updates — scan this code and add your email") sits below the ticket details, **only on partner slips and only while unclaimed** (the `/api/orders/[id]/tickets.pdf` renderer suppresses it once the order has an email — a reprinted, already-claimed slip shows the holder name instead, like an online ticket). The slip's QR thus has two audiences — door staff scan it to *admit*, the guest scans it to *claim* — and the layout speaks to both without conflating them (the QR keeps its "Scan at the door" hint; the claim invitation is the separate band). Online slips never show the band (the buyer already gave an email and was emailed the PDF).

Because the claim endpoint is an open, unauthenticated write (token possession = auth, first-claimer-wins), `POST /api/scan/[token]/claim` is rate-limited per-token + per-IP (`src/lib/rate-limit/claim-rate-limit.ts`, defaults 5/token and 20/IP per minute → `429` with `Retry-After`). It raises the bar on pre-emptive claim of a leaked token and on hammering, without affecting a single legitimate claim. In-memory sliding window — fine on single-instance Coolify (ADR-0009); swap the store if it ever scales out. An admin "unclaim / re-issue" recovery path for a mis-claim is a deferred follow-up.

### Buyer comms & consent
Three message classes, one lawful basis each. Same rules for **online buyers and claimed partner buyers** (consistency is a requirement).

| Class | Examples | Basis | Mechanism |
|---|---|---|---|
| Transactional | Digital ticket PDF on purchase/claim | Contract | Always sent |
| Operational | Show cancelled, venue changed | Contract / legitimate interest | Sent to **any order with an email** (online or claimed); no opt-in needed |
| Post-show follow-up | T+24h review request | **Soft opt-in** | No checkbox; collection-time notice + unsubscribe link |

There is **no** separate "info about the show" marketing email — the captured email is for the ticket, operational show-change notices, and the one post-show review request only.

**Soft opt-in implementation (closes a pre-existing gap):** today the review email (`src/lib/review-email/dispatch-review-emails.ts`) has **no unsubscribe link** and checkout collects **no consent notice** — online buyers already receive it with neither. The fix, applied to both checkout and the claim form: (1) a one-line collection notice ("we'll email your ticket, any show changes, and one post-show follow-up — opt out anytime"), and (2) an unsubscribe/opt-out link in the review email backed by a per-order opt-out flag + token. The review dispatcher pre-filters opted-out orders in SQL, and `sendReviewEmail` itself re-checks opt-out before sending (`isEmailOptedOut`, `src/lib/marketing/opt-out.ts`) — the authoritative consent gate lives at the send seam, so a future post-show sender can't bypass it.

### Ticket scan authorization
The `/scan/[token]` URL is **shared by buyers and door staff** — same URL, different behaviour based on auth:

- **Unauthenticated visit (buyer tapping their own QR from email):** Renders ticket details — buyer name, show date/time/venue, ticket counts — plus the QR re-rendered on-page so the buyer can show their phone screen at the door. **Does NOT mark the token as scanned.** A prominent notice reads "Show this screen at the door — do not tap the QR again."
- **Authenticated visit by a `tehnika` (or `admin` / `superadmin`) user:** Atomically marks the token scanned (or shows ALREADY_SCANNED with timestamp) and the VALID screen.

This split exists because buyers used to burn their own tickets by tapping the link to "check it works". The atomic mark-and-read race-safety still applies — only one staff scan can win for a given token.

**Staff result screens** (VALID, ALREADY_SCANNED, INVALID) all render two stacked buttons below the result text:

1. **Scan new** — primary, links to `/admin?scan=1` which auto-opens the in-page QR camera on mount (one tap re-enters scan mode for the next ticket).
2. **Back** — secondary, links to `/admin`.

ALREADY_SCANNED additionally renders **Undo scan** above these two when the original scan was within the last 2 minutes (see "Undo-scan window"). Buttons are stacked vertical, full-width, 48px min-height for thumb-tap reliability at the door.

### Admin tiers
> **Superseded by *Permission*** (see the Moreškant section below and [ADR-0023](docs/adr/0023-permissions-replace-roles-app-surface.md)). A user now holds a *set* of permissions; the role tier is gone from code as of #397, and the `role` column and its enum were dropped in #398. Kept here as the historical reading of who does what, and as the map from an old tier to its permission bundle: `superadmin` = every permission, `admin` = `tickets`+`refunds`+`door`, `tehnika` = `door`+`shared`, `partner` = `partner`, `member` = `season_stats`+`shared`. _Avoid_ these words when describing current behaviour; name the permission instead.

Payload user roles — three internal tiers from [ADR-0006](../docs/adr/0006-three-tier-admin-roles.md), plus the reseller `partner` ([ADR-0008](../docs/adr/0008-partner-sales-channel.md)) and the read-only `member` ([ADR-0022](../docs/adr/0022-member-season-dashboard.md)):

| Role | Who | Can do |
|---|---|---|
| `superadmin` | Developer (Josip) | Everything, including user management (create/delete users, change roles). |
| `admin` | HGD secretaries | Everything except user management. Add/cancel shows, view orders, issue refunds, read inquiries, record in-person sales. Sees own profile only; cannot see or promote other users. The `role` field is field-level locked to `superadmin` so secretaries can edit name/email/password but not their own tier. |
| `tehnika` | Shared door-staff account (username **`tehnika`**, no email — ADR-0011) | Authenticate `/scan/[token]` for atomic mark-as-scanned; look up a ticket by name/email/code and admit it (see Tehnika dashboard). May see, **for a specifically-searched ticket only**, buyer name + party size + show + scan status. **No financials** (amounts, refunds), **no browsable buyer list**, no order-collection browsing, cannot issue refunds. |
| `member` | Shared society-membership account (username **`member`**, no email — [ADR-0022](../docs/adr/0022-member-season-dashboard.md)) | **Read-only, one page.** Sees the season ticket dashboard (tickets issued, per-performance counts + capacity fill, adult/child, channel mix) and nothing else. No collections, no buyer PII, no money figures, no actions. Cannot even edit its own account — `member` is excluded from the `selfOrSuperadmin` update on Users, so only a superadmin rotates the shared password. |

Per-role sidebar visibility: superadmin sees all collections; admin sees everything except Users (Shows, Orders, QRTokens, ContactSubmissions, Posts); tehnika and member see an empty sidebar. The `/admin` landing route is a custom dashboard component that branches on role (stats-only for tehnika, full task dashboard for admin/superadmin).

Session length: `Users.auth.tokenExpiration` is 30 days for all tiers so the shared tehnika device stays logged in across long stretches, and secretaries aren't re-logging daily. Password rotation invalidates if a device is lost.

### Dashboard (the `/admin` landing)
The `/admin` landing is **one business-language dashboard**, not a per-role redesign of unrelated surfaces. It encapsulates the underlying collection tables into the **values and graphs** each role actually cares about — the secretary never reads a raw table to do her job; she reads numbers and charts.

- **`admin` (secretary):** the primary design target. Business language only (no DB/jargon), big legible numbers + charts, and a small set of primary actions. This is the canonical dashboard.
- **`superadmin` (Josip):** the **same** secretary dashboard **plus** a power-user "developer strip" (raw counts, system/health signals, environment indicator, direct collection links). He is not given a separate raw-table landing — Payload's left sidebar already *is* the raw view, so a second one would only duplicate it. The landing's job is the cross-collection at-a-glance that no single table gives.
- **`tehnika`:** distinct, purpose-built door-scan dashboard, also being rethought in this redesign. **Defaults to English** (the door account is shared and a guest glances at the result screen; see *Tehnika role* and *Admin language*). The Croatian default that previously applied to tehnika was reversed; partner is unaffected.
- **`partner`:** distinct, scoped reseller view; defaults to Croatian.
- **`member`:** a fifth, read-only branch — the season ticket view described in [ADR-0022](../docs/adr/0022-member-season-dashboard.md); defaults to Croatian. Its headline counts **comps** and is therefore labelled *izdano* (issued), not *prodano* (sold) — deliberately unlike the secretary dashboard, where comps sit outside sales and outside every money total.

**Visual language.** Surfaces use Payload's native theme tokens (`--theme-elevation-*`) so the dashboard harmonizes with the admin chrome and respects light/dark mode; brand identity enters only as **restrained accents** — the brand **gold** for key figures and chart fills, **Bodoni Moda SC** for the big hero numbers. Not a full brand reskin (a styled island inside Payload's grey chrome reads as disjointed and fights dark mode).

**Superadmin dev strip.** Collapsed, English/technical (independent of the language toggle), below the shared business dashboard. Implemented in `src/lib/dev-diagnostics/*` (pure + DI; `gatherDevDiagnostics` is the gating chokepoint — returns null and runs no queries for admin/tehnika/partner) and rendered by `SuperadminDevStrip`. Diagnostics that no single collection table gives: (1) an **environment + DB guard** banner (prod/staging/dev and which database — always visible, prod flagged red, protective before mutations given past prod/staging mix-ups); (2) **data-integrity counts** — per-collection row counts plus anomalies (orders with no tickets, tickets with no order, past shows still `active`, and **incomplete refunds** — orders marked `refund_status='refunded'` whose tickets are still `active`; note `enum_orders_refund_status` is only `none|refunded`, so there is **no** `pending`/`failed` state to query — this is the representable equivalent of "stuck refund"); (3) **integration health** — last online order (≈ last Stripe webhook) and last review-email sent (≈ cron), both approximations since neither persists an explicit run timestamp, plus Stripe balance (available/pending EUR, 60s-cached, fail-soft); (4) **quick collection links**; (5) the **critical-events log** (below). Every probe is independently fail-soft so one broken query can't blank the strip or break the dashboard.

**Critical-events log.** A persisted table the app writes to at known failure seams — **silent email-send failures** (e.g. Brevo 200-but-undelivered), webhook signature failures, refund failures, unhandled API 500s — each row carrying timestamp, kind, and context. The dev strip shows the last N. This is the deliberate counter to this project's recurring failure mode: errors that return success and are seen by no one (the dead contact form, the silent ticket-email failures). Raw container/stdout logs are explicitly **out of scope** — this is a curated critical-events sink, not log aggregation.

**Admin language (Payload-native i18n).** The admin is localized via Payload's built-in i18n (`supportedLanguages: { en, hr }` — Croatian ships in `@payloadcms/translations`), so the *entire* admin chrome (sidebar, tables, forms) localizes, not just the custom dashboard; the custom dashboard reads the active `req.i18n.language` and renders its own copy from a small HR/EN string map. Language is a **per-user preference** with a **permission-based default** (`defaultLanguageForUser`, `src/lib/admin-i18n.ts`): **English** for a `dev` holder and for a door-only account, **Croatian** for everyone else. The default is seeded once at login but each user can override it via Payload's native language selector in account settings (the persisted `payload-lng` cookie wins — so the shared door account can still be flipped to Croatian, and a stale `hr` cookie from prior use overrides the new English default until cleared). The non-technical secretary therefore gets Croatian automatically; the developer and the door account get English. The **door-scan overlay itself is always English** regardless of this preference (short universal words — VALID/INVALID — that a guest at the door can also read).

**Money on the dashboard — never the word "profit".** The system cannot know costs (musicians, venue), so any "profit" tile would be a mislabeled gross figure. The dashboard shows two distinct, separately-labeled money facts:
- **Revenue collected** — money actually in hand: online orders (Stripe, net of refunds) + the **offline sales ledger** (door and legacy lines, summed as `quantity × unit_price_cents`, so a child seat and a discounted seat are valued at what was actually charged). It is never a headcount multiplied by a flat price. The bare `totalRevenueCents` is *online gross only* and must not be presented as the whole.
- **Partner receivable (invoiced monthly)** — tickets issued through partners and the amount we will invoice them at month-end (`(sold − cancelled) × face − commission`). This is **not cash in hand** and is always shown apart from Revenue collected so the two are never summed into a false "profit".

### Enquiry (contact submission)
A message sent through a public form (`ContactSubmissions`). The `enquiryType` distinguishes **general** (`general`/`other`, a plain question) from **booking enquiries** (`private-moreska`/`moreska-experience`, a request to *buy* a private show or the experience). Booking enquiries are revenue leads and rank above general ones.

An enquiry has a **lifecycle**: `status: new → handled` (default `new`). The dashboard's inquiries badge counts `status = 'new'` and calls out how many of those are booking enquiries (e.g. "5 new — incl. 2 booking enquiries"); the secretary marks an enquiry `handled` to clear it. The earlier time-window approximation of "new" is rejected — it both re-surfaces answered enquiries and hides un-answered old ones.

**Notification email (implemented):** since #220 the public forms persist to `ContactSubmissions` **and** send a best-effort org-notification email (`sendEnquiryNotification` → `info@`, Reply-To the enquirer, sender `tickets@moreska.eu`). The notification is **best-effort**: a bad/missing `BREVO_API_KEY` is swallowed, so on 2026-06-03/04 it looked "dead" purely because the key was invalid (rotated 2026-06-04, confirmed working in prod). The residual risk is the *silent* failure — addressed by the critical-events log (ADR-0016 / #235), which wires this seam as its first write-site. The dashboard badge and the inbox notification are complementary, not redundant. An optional *enquirer* acknowledgement email is a separate enhancement (#236).

### Tehnika role
Renamed from `door-staff`; the shared account logs in with **username `tehnika`** (no email — hybrid username login, ADR-0011). Permissions are as listed in the Admin tiers table above; rotation policy: one-off Payload admin edit when leaked, no per-volunteer accounts (HGD is too small to justify the onboarding overhead).

The tehnika dashboard's **"Scan ticket"** button links to the dedicated **`/admin/scan`** route (`AdminScanView` → `ScanStationClient`, lazy-loaded `html5-qrcode`). A decoded QR is **POSTed to `/api/scan/[token]`** and the result is shown in a full-screen overlay — it does **not** navigate to `/scan/[token]` (that server page is the buyer view + a direct-link staff fallback). The camera stays open across scans; this avoids the 4-tap dance of native-camera → notification → Safari for every ticket.

**One-tap entry (no "Door scan" intro screen).** `/admin/scan` **auto-starts the camera on mount** so the dashboard button is a single tap into scanning. The OS camera-permission prompt only appears the first time per origin and is remembered. Because some browsers (notably iOS Safari) require a user gesture before opening a camera and a navigation tap does not carry across the page load, auto-start falls back to a single full-width "Tap to scan" button whenever it is blocked — so the very first use on such a browser may need one extra tap, but every use after permission is granted is one tap. The native camera flow remains a last-resort fallback for any device that fails entirely.

**Tehnika dashboard (redesign).** Optimized for a volunteer on a phone in a queue — leads with the **action**, not numbers:
- **Hero: tonight's admitted-progress** — a large "X / Y ušlo" (admitted / sold) ring or bar for the active door show (`getNextShow()`). The one number that matters; no revenue, no PII.
- **Dominant scan button** — full-width, thumb-height "Scan ticket" (English by default), opens the camera immediately via the auto-start `/admin/scan` flow above (**do not** revert to a native-camera-first flow, nor to a separate "Door scan" intro tap — that two-tap permission dance is exactly what this avoids).
- **Lookup / manual admit (fallback for an unscannable QR):** search by **first name / last name / both, email, or order code**. This **extends the existing audited seam** `POST /api/orders/lookup` (ADR-0006 follow-up #87): lookups are **scoped to the active show only** and **every lookup is recorded in `order-lookups`** (even zero-match) so tehnika can't fish for PII — the redesign adds **order code** as a search key and a door-friendly UI, it does **not** loosen that scope/audit. A match returns a single ticket showing name + party + show + scan status (PII boundary above), with a **"Pusti" (Admit)** button performing the same atomic mark-scanned as a QR scan. Manual admit always resolves to a **real ticket** — there is no ticketless "just open the door" (that would break the admitted count). Returns one matched ticket, never a browsable buyer list.
- **Result card persists until tapped** (no auto-dismiss on **any** state — the prior 3-second auto-resume on VALID is removed so a fast scanner never blows past a result). The overlay is **English**. Peer actions:
  - **VALID:** **Admit rest of party (N)** (only when unscanned siblings remain; `N` is the *accurate remaining-unscanned* count, not the order total — the scan API returns it as `partyRemaining`), **Scan more**, **Exit**. The card shows the party's adult/child breakdown (e.g. "4 tickets — 2 adults, 2 children"). Tapping party-admit confirms with the real count actually admitted ("Admitted 3 more") and then keeps Scan more / Exit (no surprise auto-resume).
  - **ALREADY SCANNED:** **Undo scan** (within the 2-minute window), **Scan more**, **Exit**. No party-admit here.
  - **INVALID / CANCELLED:** **Scan more**, **Exit**.
  "Scan more" resumes the still-open camera in one tap.
- **No show tonight:** a plain "No performance tonight." (English by default for tehnika).

### Undo-scan window
On the ALREADY_SCANNED page, an authenticated `tehnika` (or `admin`/`superadmin`) user sees an "Undo scan" link if the scan was within the last **2 minutes**. Clicking it sets `scanned = false` again. This covers honest misclicks at the door without opening abuse vectors (no late-night "let my friend back in" undo).

### Email addresses
One real mailbox (`info@moreska.eu`) read by Josip and the secretary; everything else is a forward-only ImprovMX alias.

| Address | Type | Purpose |
|---|---|---|
| `info@moreska.eu` | Mailbox | Catch-all; only readable inbox. Two readers: Josip + secretary. |
| `tickets@moreska.eu` | Alias → `info@` | `From:` on Brevo ticket confirmations. `Reply-To: info@`. |
| `pr@moreska.eu` | Alias → `info@` | Login/recovery for Instagram / Facebook / TikTok / YouTube. Social manager logs into platforms, not this mailbox. |
| `bookings@moreska.eu` | Alias → `info@` | Tour operator + group/charter inquiries. |
| `press@moreska.eu` | Alias → `info@` | Journalist contact published on site. |
| `dev@moreska.eu` | Alias → `info@` | Technical-admin contact for SaaS accounts (Stripe, Brevo, Coolify, Hetzner, Cloudflare, GitHub org, ImprovMX). Survives developer turnover. |
| ~~`tehnika@moreska.eu`~~ | retired | The shared tehnika `/admin` login is now **username `tehnika`** with no email (ADR-0011). No inbox ever existed; this fake-email login string is gone. |

Transactional mail sends from root `moreska.eu` via Brevo. Future bulk post-show mail will send from subdomain `bilten.moreska.eu` (separate DKIM, isolated reputation) once Brevo Starter (~€9/mo) is activated. See [ADR-0004](../docs/adr/0004-email-infrastructure.md).

### Channel
Every `Order` records the **channel** it came from: `online` (buyer paid via Stripe on moreska.eu), `partner` (a reseller sold it on their own POS), or `comp` (a complimentary ticket issued for free by an admin — see *Comp ticket*). When `channel = partner`, the order also references **which partner** (see Partner). Seats sold **at the door** or on the **legacy site** are not `Order` channels at all: they produce no order and no ticket, and live in the offline sales ledger (see *Offline sale*). A discount on such a line is a separate axis from the channel, exactly as a promo code is on an online order.

A `comp` order carries no Stripe payment (`stripePaymentIntentId = null`) and `total = 0`, so it never enters revenue math — it is deliberately a distinct channel (not a €0 `online` order) precisely so it stays out of "Revenue collected", the online channel-mix chart, and the "last Stripe webhook" health signal.

That exclusion is about **sales**, not about seats. A comp still occupies a chair, so it is counted wherever a chart measures where the seats in a house came from: the season-trajectory bars are stacked into online / at the door / partner / comp, while the "Sales channels" split beneath them stays online / at the door / partner. The two disagreeing is the design, not a bug — don't "fix" either one to match the other.

### Member (society member)
A first-class entity (Payload `Members` collection, slug `members`) representing a member of HGD Sveta Cecilija, used to **attribute comp tickets** (see *Comp ticket*) and — as a **shared relationship target** — member **promo codes** (see *Promo code* / ADR-0018-member-promo-codes; promo needs only `id` + `name`, which this shape provides). It is a single collection built once and depended on by both features. Deliberately minimal — unlike `Partners` there is no money, law, login, or commission involved:

- **Fields:** `name` (required), `active` (checkbox, default true — a retired member drops out of the comp picker without deleting their historical attributions), `note` (optional free text, e.g. "trumpet, joined 2019"). **No** email/phone/OIB/login — nothing here contacts a member through the system.
- **Managed by admin-tier** (admin + superadmin) via the sidebar, like Partners; `tehnika` and `partner` never see it. A member does **not** correspond to a Payload `Users` login — members never authenticate. Also creatable **inline** from the comp issue form's member picker ("+ Add member").
- Every `comp` order **must** reference a `member` (attribution is the whole point; enforced in the issue handler, not just the DB). This drives per-member reporting ("how many comps did member X receive this season") via `GROUP BY member`. **No per-member cap is enforced** — reporting is observational; the admin uses judgment.

### Comp ticket
See [ADR-0019](../docs/adr/0019-comp-ticket-channel-members.md). A **complimentary ticket** issued for free by an admin to an HGD **member** (see *Member*), who passes it to family/friends. The society's goodwill channel — no money, no reseller. It is the third `channel` (`comp`; see *Channel*), modelled as the partner sell's free, admin-only sibling.

**Issue flow.** An admin (admin-tier only; **not** tehnika or partner) issues from a dedicated admin action: pick a **show**, pick a **member** (required), enter **adult/child** counts. Reuses the partner sell's machinery — the advisory-lock `count → capacity-check → insert` critical section (`assertCanSell`) so comps are **capacity-guarded** exactly like a partner sale and participate in the same oversell serialization. Produces one `Order` (`channel='comp'`, `member=X`, `total=0`, `stripePaymentIntentId=null`, `email` null unless the admin enters one) with one `adult|child` **Ticket per person** (real rows → they consume seats through the normal active-ticket count). The admin downloads/prints the combined 2-up A5 PDF via `/api/orders/[id]/tickets.pdf` (already admin-authed, already handles zero-total).

**Issue UI.** A new admin-dashboard action ("Issue comp tickets / Podijeli gratis ulaznice") in the admin action row, opening a **partner-style form**: show picker (live remaining), searchable **member picker** over `active` members with an inline **"+ Add member"** create-on-the-fly (name required, optional note; creates the `Member` and selects it without leaving the form), the **±/typeable stepper** for adult/child (never native `type=number` — the wheel-scroll bug), an optional name field prefilled from the member (editable), and an optional email. On submit it reuses the partner post-sale UX: opens the combined PDF in a new tab + inline success banner with the order code, form resets, dashboard figures `router.refresh()`. Members are otherwise managed as a normal admin-tier sidebar collection.

**Cancellation.** Voided through the existing single void mechanism with `cancel_reason='storno'` (semantically "cancelled, no money moved"; comp voids are distinguished from partner storno by `channel='comp'`, so **no new enum value**). **Admin-tier only, no time window** (the same-day window is a partner self-service rule, not an admin one) while the show is upcoming. The partner undo/restore path is scoped to `order.partner = self`, so it can never touch a comp.

**Dashboard visibility.** Comps get a **visible per-show count** in the admin show list alongside online/in-person so seat math reconciles (`online + in-person + comp + remaining + legacyReserved = capacity`) — otherwise the consumed seats look like a bug. Season-level: a **count only** ("Comps issued: N"), **never** in "Revenue collected". At the door/tehnika, comps **do** count in "X / Y ušlo" (real people in seats) with no revenue exposure, and are findable by the existing name/code lookup for manual admit. A **single flat "comps per member" table** (season, count + adult/child split, `channel='comp'` grouped by member) covers the reporting need — no per-member drill-down page for now.

**Names — three distinct things:**
- **`member`** (required) — who *received* the comps. Internal attribution only, **never printed** on the slip. Drives per-member reporting (`GROUP BY member`).
- **`buyerName`** (the printed HOLDER row) — **defaults to the member's name** but is **editable** at issue time (admin may type a specific guest, e.g. "Obitelj Marić"). Optional in the sense that it may be left as the member default.
- **Claimed name** — a family/friend can **claim** the ticket via the same unauthenticated `/scan/[token]` claim flow used for partner slips (gated purely on `email == null`, so comps drop in for free). On claim they enter *their own* name + email; the existing first-claimer-wins write **overwrites `buyerName`** and sets `email`, so the **digital ticket they receive by email shows their own name**. The printed slip keeps the member's name; both copies share one `token` and both scan fine (admission is token-based, name mismatch is irrelevant).

**Comms.** If an `email` is present (entered by admin or attached by claim), the standard buyer-comms rules apply **unchanged** (transactional PDF, operational show-change notices, soft-opt-in post-show review with unsubscribe) — consistency is a requirement. No email → pure print-and-hand artifact.

**Slip appearance.** In the price slot, a comp prints **"Gratis / Complimentary"** (localized) instead of "Adult · €20". **No SOLD BY / provenance row** and the member is **never** printed. When unclaimed (no email) the slip carries the **claim band** (same gold band as partner slips) so the guest knows they can attach an email for a digital copy; suppressed once claimed. HOLDER row shows the member-default (or admin-edited) name until a claim overwrites it.

### Partner (reseller)
A first-class entity (Payload `Partners` collection). A **partner** is a travel agency / reseller (first: **Kaleta**) that sells Moreška tickets through **their own POS at full face value** (€20 adult / €10 child). Chosen over "agency" as the domain term because it covers any reseller, not only travel agencies. Each partner has a name, billing/OIB details, a **commission percent** (Kaleta = **10%**), an active flag, and one or more linked login users (role `partner`).

A **partner sale** is the third sales channel: the buyer pays the partner directly — **no Stripe payment exists on our side**. We issue the ticket artifact (QR + printable PDF); the money is reconciled **monthly** — at month-end Cecilija issues the partner a single invoice for `(tickets sold − cancelled) × face value − commission`. So a partner sale is a ticket we *issue but are not paid for at issue time*; it sits between online (paid, full PII) and in-person (no artifact, no PII).

**Partner dashboard (redesign).** A POS first, a ledger second:
- **Hero = the sell flow** (pick show with live remaining capacity, enter adult/child, issue PDF). Selling is ~90% of partner use; it stays first and prominent. The adult/child counts use a **±/typeable stepper** (big minus/plus buttons plus a directly-editable field), never a native `type=number` input — the native spinner caused leading-zero entry (`03`), tiny arrows, and the notorious wheel-scroll-while-focused jump (a "click" that bumped the count by 2 or 5 was a scroll landing on the focused field).
- **Post-sale = non-blocking confirmation, form stays.** Issuing a sale opens the combined PDF in a new tab and shows a **green inline success banner** (issued count + order code) with a **10-second countdown bar**, after which it auto-dismisses. Dismissal is driven off the **bar actually finishing** (its CSS `transitionEnd`, with a safety fallback) so the banner never vanishes before the bar reaches 0 — the parent-`setTimeout` + child-`requestAnimationFrame` split previously cut it ~a frame short. The sell form is **not** replaced by a "Sale complete" card; it stays put with counts reset to 0, ready for the next sale, and the dashboard's own figures (recent orders, this-month, season) **refresh in place** (`router.refresh()`) — no full page reload, no stale "nothing happened until I refresh the whole site".
- **Live "ovaj mjesec / this month" standing card** — the same euros the org dashboard calls **partner receivable**, shown from the partner's side and **live month-to-date**, not only in the end-of-month PDF: tickets sold this month (still **net of cancelled** in the figure; the "bez storniranih / net of cancelled" sub-label under it was **removed** as noise), **Za platiti HGD-u / you owe HGD** = `(sold − cancelled) × face − commission`, and **Vaša provizija / your commission**. (Mid-month figures move as same-day stornos settle; that's accepted.)
- **Recent orders = one merged list (storno folded in).** A **single "Nedavne narudžbe / Recent orders"** list. Shows the **newest 3** by default; **"Prikaži više / Show more"** opens a **pager** (10 orders per page, ‹ › navigation through the partner's whole history), and **"Prikaži manje / Show less"** collapses back to 3 (scoped endpoint `/api/partner/sales`, page + size params). Each order is a **dense single row**: code · 🕒 sold date+time · ⚔ **show (izvedba) date** · people · money · a **download-tickets** icon · and (today only) a **cancel** icon. Meta dates are disambiguated by **inline SVG icons** (clock = sold; **crossed-swords = the izvedba**, since moreška is a sword dance) with tooltips. **Download** (opens the order's always-English ticket PDF) is on **every** row (reprints). A **today** (Europe/Zagreb) order shows a **chevron** and **expands** to its per-person tickets, each individually cancellable; **earlier-day** orders are flat (no chevron, no cancel — outside the same-day storno window), download-only, under a "RANIJE / Earlier" divider. The cancel control is a **red trash icon**. **No confirm dialog** — tapping it **cancels immediately** and shows an **undo banner** (see below).
- **Cancel = delete-then-undo (no confirm).** Tapping the trash voids at once and shows a **single muted status banner at the top of the panel** (not green — green = created) with a countdown bar + **"Poništi / Undo"**: a whole **order** delete (row removed) holds for **6 s**, a **per-ticket** cancel for **4 s**; if a per-ticket cancel empties the order, the order drops too and Undo restores both. The void commits immediately (seat frees, invoice updates); **Undo** calls a new **restore endpoint** that re-activates the storno'd tickets (`status='active'` where `cancel_reason='storno'`), re-checking ownership + same-day window + that the seat is still free (fails soft: "Nije moguće poništiti, mjesto je zauzeto"). Immediate-void + restore beats a deferred/"pending" delete (no half-freed seat, survives navigating away). One banner at a time, latest-delete-wins.
- **Statistika (was "Vaše narudžbe").** The per-show table is replaced by a **stacked bar chart** of the partner's own tickets sold per izvedba (gold = adults, lighter = children), with the season total + legend on top. **Scaled to the partner's own busiest izvedba** (not venue capacity — a partner sells a sliver of a 350-seat house). **Responsive orientation: horizontal rows on phone (≤768px via admin `custom.css`), vertical admin-style columns on desktop.** Chronological, only izvedbe they sold for. The formal **monthly statement PDF** is kept below it.
- **Help / contact at the foot.** Below "Prijavljeni kao <partner>" sits a **"Trebate pomoć?"** line with a **`mailto:` link to `admin@moreska.eu`** (subject prefilled, e.g. "Partnerska ploča — pomoć (<partner>)"). A `mailto:` over an in-app form deliberately: it can't fail silently (the org's recurring email-send failure mode), uses the partner's own client, and makes their address the natural reply-to.
- **Croatian by default, and actually localized.** Every partner-facing string runs through `adminT(lang, …)` with HR + EN copy. Partners default to HR (`defaultLanguageForUser`), so an un-localized literal silently showed English; the whole surface must track the active admin language.

**Partner vocabulary: "narudžba / order" vs "prodaja / sale".** In the **partner-facing** UI, a completed purchase record is a **narudžba / order** (the unit the partner browses, downloads, and cancels): *Nedavne narudžbe / Recent orders*, *Vaše narudžbe / Your orders*, *Otkaži narudžbu / Cancel order*. The word **prodaja / sale** is reserved for the **act of selling** — the sell form (*Prodaja ulaznica / Sell tickets*) and the admin-only *Prodajni kanali* keep it. The success banner ("Prodaja dovršena / Sale completed") is the *act* completing, so it stays "prodaja/sale". The partner cancel verb is **otkazati / cancel** (user-facing), even though the **internal mechanism and the domain term remain *Storno*** (`tickets.cancel_reason = 'storno'`, the same-day window) — don't surface "storno" to partners, but it's still the glossary term in code/admin/docs.

### Order code & ticket reference
Every `Order` carries a short **code** — a **human reference only, not a secret** (the per-ticket `token` remains the security boundary for admission and claiming). Format: **4 characters** from an **unambiguous uppercase alphabet** (excludes confusable `0/O`, `1/I/L`) ≈ 920k codes. Uniqueness enforced by a DB unique constraint on `orders.code`; generate-random-and-regenerate on the rare collision. Not derived from the order id (that would leak sales volume and be enumerable).

Each ticket has a human reference `<CODE>-<n>` (`A7K9-1`, `A7K9-2`, …), `n` being its 1-based position in the order. Numbering is **stable**: a storno/refund cancels ticket `-2` but does not renumber `-3`; gaps are intentional and informative. Printed on each A5 slip and shown in lists. Knowing a code/ticket-ref grants nothing — only the `token` admits or claims.

### Ticket (formerly QR token)
A `Ticket` (Payload `Tickets` collection, table `tickets` — renamed from `qr_tokens`) is **one admission for one person**. Fields: a unique `token` (encodes `/scan/[token]`), a `type` (`adult | child`), `scanned` / `scannedAt`, a lifecycle `status` (`active | cancelled`) with `cancelledAt` + `cancelReason` (`storno | refund`), and a link to its parent `Order`. One per person system-wide (see "One QR per person"). The rename retires the implementation-flavoured "QR token" name; the QR is just how a ticket is presented.

**Voiding (single mechanism, two callers):** a cancelled ticket is excluded from the active seat count, stats, and invoices.
- **Online refund** cascades: void **all** the order's tickets (`reason = refund`) + Stripe refund + `order.refundStatus = refunded`.
- **Partner storno** voids the specific ticket(s) (`reason = storno`), same-day-only, no money movement.
A cancelled ticket still exists, so a printed-but-voided slip scans to a clear INVALID/CANCELLED state rather than vanishing.

The online refund flow is **safely re-runnable end to end** (`src/lib/refund-order.ts`): the Stripe call carries a stable idempotency key (`refund:<paymentIntentId>`, `src/lib/refund/create-stripe-refund.ts`) so a retry returns the *original* refund instead of erroring or double-refunding; and a retry on an already-`refunded` order still re-voids its tickets (idempotent, no Stripe call, no re-email) so a void that failed mid-flow self-heals. The void SQL's seat-freeing is regression-checked by `scripts/probe-refund-void.mjs` (runs inside a transaction that always rolls back — safe against any DB, kept out of the offline unit suite).

### Partner sell flow
A `partner`-role user, from their scoped `/admin` dashboard: picks an **active upcoming show**, enters **adult** and **child** counts, and gets a **combined PDF** (2-up A5, all tickets) to print on the spot. **No buyer PII, no Stripe, no email** at sell time. Seats are guarded against the **live remaining capacity** (`remaining = capacity − active tickets − inPersonSold − legacyReserved`) — the sell is rejected if it would oversell, and the dashboard shows remaining per show. The partner sells at **flat face value** (no 5th-free; see Free-ticket discount). Each sale = one `Order` (`channel = partner`, `partner = X`, `total` = face value owed, no `email`/`buyerName`), with one `adult|child` ticket per person.

**The slip names the selling partner.** Each partner ticket prints a **SOLD BY / PRODANO PUTEM: \<partner name\>** detail row (provenance for the door and the guest). Because a partner order has no `buyerName` until claimed, the slip **omits the empty HOLDER row** on an unclaimed partner ticket and shows SOLD BY in its place; once claimed it shows **both** HOLDER (the buyer) and SOLD BY (the partner). Online slips carry no SOLD BY row.

### Partner monthly reconciliation
The app produces a **per-partner monthly reconciliation statement** — NOT a fiscal invoice. The legal `račun` is issued by the secretary in their own accounting/fiscal tool (avoids fiskalizacija liability **for this partner/B2B channel only**). **The online B2C channel is separate: direct card sales to consumers via Stripe DO require a fiscalized račun (ZKI/JIR) — HGD is a confirmed obveznik fiskalizacije (obveznik poreza na dobit). This is a known gap, not yet implemented; tracked in #297.** The statement, viewable/exportable by admin and the partner, breaks down for the calendar month: tickets sold by show and type, cancelled (storno) count, **gross** (`sold × face value`), **commission** (gross × partner `commissionPercent`, Kaleta 10%), and **net payable**. Period is bucketed by **sold date** (`order.created_at`); because storno is same-day-only, the month-end active-ticket count is already final.

### Partner stats
The partner's scoped dashboard shows only **their own** sales: season total tickets sold, per-show counts, and the **last few sales** (recent list). No other partner's data, no PII beyond their own sales, no org-wide revenue. Reuses the stats query layer, filtered by `orders.partner = <self>`.

### Storno (partner cancellation)
A partner can cancel a ticket it sold, but only **on the same calendar day it was sold** (NOT the show day), in **Europe/Zagreb** local time. Example: Kaleta sells on 3 June a ticket for the 7 June show — they may storno it on 3 June only. This bounds cancellations to the same business day, before monthly settlement; it removes the ticket from the invoice count and frees the seat. After that day the sale is final for invoicing.

**Actor & granularity:** **partner self-service** from their dashboard — they may void an **individual ticket** or the **whole sale** (the order's tickets), same-day-only and **server-enforced** against `order.created_at` (never client-trusted). An **admin can storno anytime** (not bound to the same-day window) for corrections. Voiding uses the soft-cancel mechanism (`tickets.status = cancelled`, `reason = storno`).

**Short undo window (partner UI).** Storno is normally one-way, but the partner dashboard fronts it with a **delete-then-undo** affordance (no confirm dialog): the void commits immediately, then a banner offers **Undo** for a few seconds (order 6 s, ticket 4 s — see *Partner dashboard*). Undo hits a **restore op** that flips the just-storno'd tickets back to `status='active'` (only `cancel_reason='storno'` rows, re-checking partner ownership + same-day window + that the seat is still free; soft-fails if the seat was retaken in the interim). This is the **only** path that un-voids a ticket; the refund void and any expired-window storno stay permanent.

### Self-serve reschedule refund
When HGD **reschedules** a show, every online buyer's tickets are automatically carried to the new date — but a buyer who can't make the new date may **cancel and refund their whole order themselves, with no staff involvement**, from a link in the reschedule email. This right is **scoped to the reschedule event only** — it is *not* a standing "cancel my order anytime" capability. See [ADR-0021](../docs/adr/0021-self-serve-reschedule-refund.md).

- **Reschedule refund token:** a stateless **per-order HMAC** (`base64url(orderId).HMAC-SHA256(orderId, PAYLOAD_SECRET)`, same construction as the *unsubscribe token*) carried in the email link. Possession = authorization for that one order. No DB row, no expiry — it proves identity only; **eligibility is always re-derived server-side**.
- **Eligibility (all re-checked in the handler):** the order's show was actually rescheduled (`shows.dateChangedAt IS NOT NULL`), `channel='online'` (a comp is free, a partner didn't pay us online), `refundStatus='none'`, and **no ticket in the order has been scanned**. The gate is **scan status, not the calendar** — there is *no* time cutoff, so a no-show can still refund after the date; a scan is the proof-of-consumption that closes the door. Full-order only (all sibling tickets void together).
- **Surface:** a dedicated buyer page `/order/[token]/refund` (outside `(frontend)`, like `/scan/[token]`) with a **secondary** "Cancel & refund" CTA and an explicit **confirm step** before firing; states = eligible / already-refunded / not-eligible / invalid-token; bilingual via `orders.locale`. The mutation is `POST /api/order/[token]/refund`, rate-limited per-token + per-IP, which reuses the existing admin **refund engine** (`refundOrder()` — Stripe refund → mark refunded → void tickets → refund email). A **token/signature-authed public route**, the sanctioned exception to the `requirePermission` rule (alongside the Stripe webhook, claim, unsubscribe, cron).

### Stats dashboard
Lives at `/admin` (the route is the admin landing page itself; the old `/admin/stats` URL is collapsed into it). Visible to `tehnika`, `admin`, and `superadmin`. See [ADR-0006](../docs/adr/0006-three-tier-admin-roles.md). Role-aware — different layouts:

**Admin / superadmin dashboard:**
- Top — season aggregate: total tickets sold (online + in-person), total scanned, total revenue (EUR), broken down by venue.
- Action row: Add show, Record in-person sale, Find order (deep-link into Orders list), Inquiries.
- Body — show list: one row per upcoming show + today + last 7 days of past shows. Columns: date, venue, capacity, online sold, in-person sold, scanned, remaining. Force-dynamic — refreshes on each page load (no polling). Past shows beyond 7 days are reachable from a "Browse all shows" link.

**Tehnika dashboard** — purpose-built for a door-staff workflow, deliberately minimal:
- One single block for the **next show only** (`SELECT … FROM shows WHERE date >= today ORDER BY date ASC LIMIT 1`). Fields: show date, **Online sold** (= `shows.onlineSold`), **Scanned (people)**, **In-person sold** (= `shows.inPersonSold`).
- **No season aggregate. No revenue. No other shows.** Tehnika does not need season-wide numbers; revenue is a PII-adjacent metric that ADR-0006 keeps out of the tehnika tier.
- Action row: a single **Scan a ticket** button that lazy-loads the in-browser QR scanner. Auto-opens when the page is loaded with `?scan=1` (used by the scan-result screen's "Scan new" button to chain admits in one tap).


### Financije
The money screen of Cecilija (decided in #476): revenue collected, refunds, partner receivable per month with the statement download, the door-sales ledger per performance. Unlocked by `finance`, never by `tickets` alone, and it shows no buyer. *Statistika* is its counterpart: counts and fill for `tickets`, `season_stats` and `finance`, never money.
### Scanned (people)
The "Scanned" number on the dashboard counts **people through the door**, not orders or tokens. After the "one QR per order" rule, a single scanned token represents an entire party; the number that actually matters to door staff is the seat-equivalent count.

Computed via JOIN: `SELECT COALESCE(SUM(o.adult_count + o.child_count), 0) FROM orders o JOIN qr_tokens q ON q.order_id = o.id WHERE o.show = $1 AND q.scanned = true`. Apples-to-apples with `onlineSold` (also seat-based) so `onlineSold − scanned = people still expected to arrive`.

**Per-show drill-down `/admin/stats/[showId]`:**
- For `tehnika`: bigger numbers only — online, in-person, scanned (people), remaining. **No revenue.** No order list.
- For `admin` and `superadmin`: numbers (including revenue) + full order list (buyer name, email, ticket count, per-QR scanned/unscanned state). Used to find a specific buyer's order on demand.

### Critical-events log
A small **curated sink** the app writes to at known failure seams that would otherwise be silent. It is **not** log aggregation — raw container/stdout logs are explicitly out of scope; this is a deliberately-recorded set of events worth a human's attention. Each row carries a timestamp, a machine `kind`, and an optional JSON `context`. See [ADR-0016](../docs/adr/0016-critical-events-log.md).

- **Table:** `critical_events` (`id`, `kind`, `context jsonb`, `created_at`). A raw table created by the bootstrap-SQL pattern ([ADR-0013](../docs/adr/0013-schema-management-bootstrap-sql-drift-gate.md)) — **not** a Payload collection, like `marketing_optouts`.
- **Writer:** `src/lib/critical-events/record.ts` (`recordCriticalEvent`). **Best-effort by construction** — it swallows its own errors, so a writer can call it unguarded and a logging failure can never cascade into failing the operation that was trying to report a problem.
- **First write-site (#235):** the enquiry-notification path. Before this, a contact-form submission was stored but the admin email silently failed to deliver on a bad/missing `BREVO_API_KEY`, and nobody was told. `submitEnquiry` now records `enquiry_notification_failed` when the Brevo send throws, and `enquiry_notification_skipped` when no notifier is wired (the adapter omits it exactly when the key is missing). The stored enquiry stays successful either way.
- **Reader / UI:** `src/lib/critical-events/list.ts` (`listRecentCriticalEvents`) feeds a **collapsed, superadmin-only dev strip** on the `/admin` landing (`CriticalEventsDevStrip`). `admin`, `tehnika`, and `partner` never see it.

## Moreškant (dancer roster app)

Terms for the roster / attendance / lineup module ([ADR-0023](docs/adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](docs/adr/0024-moreskant-roster-domain.md)). The module lives inside **Cecilija** (see *Product surfaces*) at `/app`; "Moreškant" was the app's name until 2026-09 and now names only the dancer and this section.

### Permission
A named capability granted to a user; a user holds a *set* of them. Replaces the role tier. Vocabulary: `users`, `tickets`, `refunds`, `door`, `partner`, `season_stats`, `moreska`, `moreskant`, **`finance`** (money without buyers: revenue, refunds, partner receivable; also unlocks Statistika), **`editor`** (Objave and FAQ in the Backoffice, which `tickets` no longer reaches), `dev`. `finance` exists because the society's tajnik and blagajnik are different people by statute: the president reads revenue without holding `tickets`. "Superadmin" is no longer an entity, only shorthand for "all permissions". `partner` requires a Partner link; `moreskant` requires a Member link.
_Avoid_: role, tier, admin-tier, superadmin (as a role).

### Voditelj
A user holding the `moreska` permission: runs the roster, edits performances, sets lineups, sends alarms, reads dancer stats, uses the MCP server. Josip and Branimir. Not every ticket admin is a voditelj (Tatjana is not).
_Avoid_: admin, coach, leader.

### Moreškant
A person who dances the Moreška. Modelled as a **Member** with `isMoreskant`, plus nickname, mobile, email, dance roles and a primary role. A moreškant need not have a login (a guest in a lineup is still a Member row). A moreškant with a login holds the `moreskant` permission and a Member link. Sees nicknames and mobiles of other moreškanti, never emails.
_Avoid_: dancer (in code names only), performer, user.

### Active moreškant
A moreškant is **active** when they are dancing this season. `active: false` does not mean "left the society": it means *in the system, not dancing now* — the person keeps their profile, their lineup history and their statistics, but drops out of the postava and attendance pickers, so nobody waits on an answer that is never coming. That is the same `active` flag ADR-0019 uses to retire a comp-attribution Member, read for the roster; six of the 2026 roster carry it.
_Avoid_: retired, inactive member, former moreškant.

### Nadimak (nickname)
The name shown everywhere in the app for a moreškant ("Cici" for Ivan Fabris). Full name is kept for the voditelj and for comp attribution. Required and **unique among moreškanti, case-insensitively** ("cici" and "Cici" are one person), which is also where a dancer's username comes from when they are invited (`Cici` → `cici`, a second one → `cici2`).

### Dance role
What a moreškant can dance: `crni` ⚫, `bili` 🔴 (the "white" army wears red), `crni_kralj`, `otmanovic`, `bili_kralj`, `bula`. A member may hold several. `crni_kralj` and `otmanovic` are special roles of a *crni* and require `crni`; `bili_kralj` requires `bili`. Only a voditelj edits roles.

### Primary role
The single dance role displayed on a moreškant's profile card (Cici: `crni_kralj`), chosen by the voditelj from the member's roles.

### Performance (in Moreškant)
Every occasion the Moreška is danced, public or not. Extends the existing `Shows` record with a **kind** (`redovna | dmc | gulliver | koncert | ostalo`) and a **public** flag. Only public performances have a venue, capacity, sales, and appear on `/tickets`; non-public ones carry a free-text **location** ("Le Ponant, luka"). Each performance has an **army threshold** (default 8 crni / 8 bili) and an optional **voditelj note** visible to moreškanti.
_Avoid_: show (for non-public ones), gig, event.

### Attendance
A moreškant's answer for one performance: **no answer** / **coming** / **not coming** — no answer being the *absence of a row*, never a third value. A multi-role dancer only says "coming"; the voditelj picks the army, and until they do the answer counts in the army of the dancer's **primary role** (`crni`/`crni_kralj`/`otmanović` → crni, `bili`/`bili kralj` → bili, `bula` → neither). A voditelj may answer on someone's behalf, at any time. A dancer's own answer is changeable until the performance starts.
_Avoid_: RSVP, availability, sign-up.

### Army count
Headcount of "coming" per army, compared to the threshold. `crni_kralj` and `otmanovic` count as crni, `bili_kralj` as bili, `bula` counts in neither. "3 bilih, 7 crnih" always states the *current* headcount, never the shortfall.

### Pozivnica (invitation)
The only way a moreškant gets a login. A voditelj presses "Pošalji pozivnicu" on the Member; the account is created with exactly the `moreskant` permission and the Member link, and the dancer gets a Croatian email with a link to choose a password, **valid for seven days**. Pressing again sends a fresh link to the same login, never a second one. A dancer who forgets their password asks for one themselves from the login page and gets the same page behind a **one-hour** link.
_Avoid_: registration, sign-up, account request.


### Članovi
The voditelj's roster screen in Cecilija (decided in #476): the list of moreškanti, each dancer's profile (nadimak, mobile, email, dance roles, primary role, active), adding a dancer by hand, and every *Pozivnica* affordance (the rehearsal join code, pending claims, invitations per dancer). Unlocked by `moreska`. Deleting a member and the attribution half of a *Member* stay in the Backoffice.
### Alarm
The push "Sokoliću, fali nas! Stanje za nastup <date time>: 3 bilih, 7 crnih" sent to moreškanti with **no answer** when an army is below threshold. Automatic once per performance at T-6h (or 18:00 the day before when the performance starts before 14:00, Europe/Zagreb), plus manual by a voditelj at any time. "Sokoliću" is a generic greeting, not a vocative of the nickname. The automatic one is claimed once per performance whether or not it is sent, so an evening judged covered at T-6h stays judged.

### Lineup (postava)
Who danced which dance role at a performance: one entry per member, exactly one role each. Enterable before or after the performance; **confirmed** by a voditelj marks it final. Only confirmed lineups feed statistics. A role outside the member's profile is a warning, not a block. The MCP `set_lineup` tool always writes an *unconfirmed* lineup.
_Avoid_: cast, roster (roster = the whole membership).

### Dancer statistics
Per season (calendar year, as in ADR-0022): confirmed performances per moreškant, and how many times each danced `crni_kralj`, `bili_kralj`, `otmanovic`, `bula`. Past seasons selectable. Confirmed lineups of past performances are visible to every moreškant.

### Ljestvica (leaderboard)
The dancer's own tab in Cecilija (decided in [Cecilija: route map](https://github.com/jivancevic/sveta-cecilija/issues/473)): a moreškant's own season on one side and the season's moreškanti ranked by confirmed performances on the other, the same count as *Dancer statistics*, shown in full with nicknames. A voditelj sees the whole table there; the tab replaces the former "Moje" tab and the separate dancer statistics page. Every active moreškant is on it, equal counts share a rank. The count is a lineup fact, never an attendance answer, so saying "coming" moves nobody. Milestones (5, 10, 15 and 20 performances, and **puna sezona** = danced every confirmed performance of the season) are read off that same count. No streaks. Past seasons selectable.
_Avoid_: points, streak, ranking by answers, "Moje", statistika (that word is the sales screen).

### Dobrodošlica (onboarding)
The three-step walkthrough a moreškant sees once per device after signing in: add to the home screen (left out when the app is already opened as an installed app), turn on notifications, subscribe to the calendar feed. Every step can be skipped and skipping counts as seen. Remembered on the device only, so a new phone shows it again.
_Avoid_: tutorial, wizard, setup.

### Moreškant comp
A comp ticket (see *Comp ticket*) a moreškant issues for themselves at a public performance, attributed to their own Member row, capped at **4 tickets per performance** for self-issued ones only; admin-issued comps do not count. Cancelable by the moreškant until the performance starts, while unscanned.

### Notification types
Push is the only channel that reaches a phone; since the route map decision every notification is also kept in the *Sandučić obavijesti* for reading later. (1) Alarm; (2) answer reminder at T-48h to *no answer*, and its window **closes 24 hours later** — a performance entered inside T-24h gets no reminder at all, the alarm covers it; (3) performance change (date, time, place, cancellation, voditelj note) to everyone except *not coming*, cannot be muted; (4) new performance to everyone; (5) to voditelji: a "coming" withdrawn within 24h. A user may hold several push subscriptions, **one per device**: the endpoint is unique across the whole table, not per user, so a shared phone rings for whoever signed in last rather than for both.

### Calendar feed
One **shared** tokenised ICS subscription (`CALENDAR_FEED_TOKEN`, amended #433) of the current and future seasons' performances, for Google/Apple/Outlook calendars. The same URL for everybody, safe to paste in the WhatsApp group: it carries dates, places and the voditelj note, and nothing personal.

### MCP (Moreškant connector)
The server a voditelj adds to the Claude app (`https://moreska.eu/api/mcp/mcp`, the full URL) so a postava can be dictated from a photo of the paper list (ADR-0024). Behind OAuth 2.1 with PKCE and one pre-registered public client; consent happens once at `/app/authorize`, restricted to `moreska`, and the **access token lives one year with no refresh token**. A token acts as its user and the permission is re-checked on every call, so revoking is either deleting the token row or removing `moreska`. Five tools: read the season, read one performance, read the roster, write an *unconfirmed* postava, create non-public performances in bulk. Nothing that confirms, alarms, answers attendance or issues a ticket.
_Avoid_: API key, integration, bot.
