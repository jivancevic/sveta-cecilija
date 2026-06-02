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
| `ljetno-kino` | Ljetno kino | Summer Cinema | 320 | Default for all public ticketed shows |
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
22 Redovna shows from 2026-05-18 to 2026-10-14, all at `ljetno-kino`, all 21:00. Seeded into the `shows` collection via `db/schema/seed-shows.sql` (idempotent `WHERE NOT EXISTS` guard). The full schedule in `docs/performances.md` lists 36 rows total — the 14 non-Redovna entries (Adriatic DMC charter shows on cruise ships like Le Ponant / Le Bougainville / NG Orion / Lady Eleganza, Gulliver group tours, KONCERT at Sv. Justina, and the Sv. Todor pilgrimage performance) stay in the docs as scheduling context for the secretary but are deliberately not in the DB — they aren't publicly ticketed and would clutter `/tickets`.

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

### Croatian capitalisation: moreška
"moreška" and its declensions (moreške, morešku, moreškom…) are always **lowercase** in Croatian — it is a common noun (a type of dance), not a proper name. Use uppercase only when it begins a sentence. In English, "Moreška" is treated as a proper name and capitalised throughout.

### Legacy reservations
Tickets sold on the previous site (`korcula-moreska.com`) before the moreska.eu cutover. Tracked as a per-show integer `legacyReserved` on the `Shows` collection, hand-entered by admin from counts supplied by the old-site operator. Subtracted from venue capacity so the booking flow can't oversell against seats already promised on the old system:

`remaining = VENUE_CAPACITY[venue] − onlineSold − inPersonSold − legacyReserved`

The field is write-once-per-show in normal use; after the old site is frozen, the count for a given show only changes if a legacy buyer is refunded by the old-site operator.

### Seats sold / remaining capacity
Source of truth for sold seats is the **`tickets` table**, not maintained counters. Each active ticket = one seat. The `onlineSold` counter (and any per-partner counter) is **retired**:

`remaining = VENUE_CAPACITY[venue] − COUNT(active tickets for show) − inPersonSold − legacyReserved`

- `inPersonSold` stays a counter — it is the artifact-less door tally that produces no `tickets` rows.
- `legacyReserved` stays a counter — old-site seats with no rows here.
- A **cancelled** ticket (partner storno, or an online refund) is excluded from the active count, so the seat frees itself with no counter to decrement. This requires a ticket lifecycle state (see Ticket) — voiding is the single mechanism behind both storno and refund.
- Consequence: the Stripe refund route must now **void the order's tickets** (previously it only set `order.refund_status`), and the webhook no longer increments `onlineSold`. Stats reads that summed `onlineSold` switch to counting tickets.

**Oversell serialization (#179):** counting active tickets and then inserting are separate steps, so concurrent sells of the last seats could both pass the guard and oversell. The `count → capacity-check → insert` critical section is serialized per show by a **Postgres advisory lock** keyed on the show id (`src/lib/tickets/sell-lock.ts`, `withShowSellLock`), wired into both the **partner sell** (`createPartnerSale`, rejects cleanly on oversell) and the **online webhook** insert (`handlePaymentSucceeded` — post-payment, so it never rejects; the lock keeps the count consistent across channels, and the pre-payment guard in `checkout.ts` remains the online defense). Different shows use different lock keys → no contention, no deadlock. Proven under real concurrency by `scripts/probe-oversell.mjs` (20 sells racing for 3 seats → exactly 3 with the lock; oversells without it).

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

### Buyer comms & consent
Three message classes, one lawful basis each. Same rules for **online buyers and claimed partner buyers** (consistency is a requirement).

| Class | Examples | Basis | Mechanism |
|---|---|---|---|
| Transactional | Digital ticket PDF on purchase/claim | Contract | Always sent |
| Operational | Show cancelled, venue changed | Contract / legitimate interest | Sent to **any order with an email** (online or claimed); no opt-in needed |
| Post-show follow-up | T+24h review request | **Soft opt-in** | No checkbox; collection-time notice + unsubscribe link |

There is **no** separate "info about the show" marketing email — the captured email is for the ticket, operational show-change notices, and the one post-show review request only.

**Soft opt-in implementation (closes a pre-existing gap):** today the review email (`src/lib/review-email/dispatch-review-emails.ts`) has **no unsubscribe link** and checkout collects **no consent notice** — online buyers already receive it with neither. The fix, applied to both checkout and the claim form: (1) a one-line collection notice ("we'll email your ticket, any show changes, and one post-show follow-up — opt out anytime"), and (2) an unsubscribe/opt-out link in the review email backed by a per-order opt-out flag + token. The review dispatcher skips opted-out orders.

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
Three Payload user roles, see [ADR-0006](../docs/adr/0006-three-tier-admin-roles.md):

| Role | Who | Can do |
|---|---|---|
| `superadmin` | Developer (Josip) | Everything, including user management (create/delete users, change roles). |
| `admin` | HGD secretaries | Everything except user management. Add/cancel shows, view orders, issue refunds, read inquiries, record in-person sales. Sees own profile only; cannot see or promote other users. The `role` field is field-level locked to `superadmin` so secretaries can edit name/email/password but not their own tier. |
| `tehnika` | Shared door-staff account (`tehnika@moreska.eu`) | Authenticate `/scan/[token]` for atomic mark-as-scanned. View `/admin` stats dashboard with non-PII counts only. Cannot see customer emails, order details, or issue refunds. |

Per-role sidebar visibility: superadmin sees all collections; admin sees everything except Users (Shows, Orders, QRTokens, ContactSubmissions, Posts); tehnika sees an empty sidebar. The `/admin` landing route is a custom dashboard component that branches on role (stats-only for tehnika, full task dashboard for admin/superadmin).

Session length: `Users.auth.tokenExpiration` is 30 days for all tiers so the shared tehnika device stays logged in across long stretches, and secretaries aren't re-logging daily. Password rotation invalidates if a device is lost.

### Tehnika role
Renamed from `door-staff` to match the shared login string `tehnika@moreska.eu`. Permissions are as listed in the Admin tiers table above; rotation policy: one-off Payload admin edit when leaked, no per-volunteer accounts (HGD is too small to justify the onboarding overhead).

The tehnika dashboard includes a **"Scan a ticket"** button that opens a live camera viewfinder in-page (lazy-loaded `html5-qrcode`). Detected QRs navigate to `/scan/[token]`. This avoids the 4-tap dance of native-camera → notification → Safari for every ticket. The native camera flow still works as a fallback for any device that fails the camera-permission flow.

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
| `tehnika@moreska.eu` | Payload login string | Shared tehnika `/admin` login in production. No inbox; nothing sent to it. Renamed from `door-staff@moreska.eu`. |

Transactional mail sends from root `moreska.eu` via Brevo. Future bulk post-show mail will send from subdomain `bilten.moreska.eu` (separate DKIM, isolated reputation) once Brevo Starter (~€9/mo) is activated. See [ADR-0004](../docs/adr/0004-email-infrastructure.md).

### Channel
Every `Order` records the **channel** it came from: `online` (buyer paid via Stripe on moreska.eu) or `partner` (a reseller sold it on their own POS). When `channel = partner`, the order also references **which partner** (see Partner). The legacy bare-counter `inPersonSold` on `Shows` is a separate, artifact-less tally and is not an `Order` channel.

### Partner (reseller)
A first-class entity (Payload `Partners` collection). A **partner** is a travel agency / reseller (first: **Kaleta**) that sells Moreška tickets through **their own POS at full face value** (€20 adult / €10 child). Chosen over "agency" as the domain term because it covers any reseller, not only travel agencies. Each partner has a name, billing/OIB details, a **commission percent** (Kaleta = **10%**), an active flag, and one or more linked login users (role `partner`).

A **partner sale** is the third sales channel: the buyer pays the partner directly — **no Stripe payment exists on our side**. We issue the ticket artifact (QR + printable PDF); the money is reconciled **monthly** — at month-end Cecilija issues the partner a single invoice for `(tickets sold − cancelled) × face value − commission`. So a partner sale is a ticket we *issue but are not paid for at issue time*; it sits between online (paid, full PII) and in-person (no artifact, no PII).

### Order code & ticket reference
Every `Order` carries a short **code** — a **human reference only, not a secret** (the per-ticket `token` remains the security boundary for admission and claiming). Format: **4 characters** from an **unambiguous uppercase alphabet** (excludes confusable `0/O`, `1/I/L`) ≈ 920k codes. Uniqueness enforced by a DB unique constraint on `orders.code`; generate-random-and-regenerate on the rare collision. Not derived from the order id (that would leak sales volume and be enumerable).

Each ticket has a human reference `<CODE>-<n>` (`A7K9-1`, `A7K9-2`, …), `n` being its 1-based position in the order. Numbering is **stable**: a storno/refund cancels ticket `-2` but does not renumber `-3`; gaps are intentional and informative. Printed on each A5 slip and shown in lists. Knowing a code/ticket-ref grants nothing — only the `token` admits or claims.

### Ticket (formerly QR token)
A `Ticket` (Payload `Tickets` collection, table `tickets` — renamed from `qr_tokens`) is **one admission for one person**. Fields: a unique `token` (encodes `/scan/[token]`), a `type` (`adult | child`), `scanned` / `scannedAt`, a lifecycle `status` (`active | cancelled`) with `cancelledAt` + `cancelReason` (`storno | refund`), and a link to its parent `Order`. One per person system-wide (see "One QR per person"). The rename retires the implementation-flavoured "QR token" name; the QR is just how a ticket is presented.

**Voiding (single mechanism, two callers):** a cancelled ticket is excluded from the active seat count, stats, and invoices.
- **Online refund** cascades: void **all** the order's tickets (`reason = refund`) + Stripe refund + `order.refundStatus = refunded`.
- **Partner storno** voids the specific ticket(s) (`reason = storno`), same-day-only, no money movement.
A cancelled ticket still exists, so a printed-but-voided slip scans to a clear INVALID/CANCELLED state rather than vanishing.

### Partner sell flow
A `partner`-role user, from their scoped `/admin` dashboard: picks an **active upcoming show**, enters **adult** and **child** counts, and gets a **combined PDF** (2-up A5, all tickets) to print on the spot. **No buyer PII, no Stripe, no email** at sell time. Seats are guarded against the **live remaining capacity** (`remaining = capacity − active tickets − inPersonSold − legacyReserved`) — the sell is rejected if it would oversell, and the dashboard shows remaining per show. The partner sells at **flat face value** (no 5th-free; see Free-ticket discount). Each sale = one `Order` (`channel = partner`, `partner = X`, `total` = face value owed, no `email`/`buyerName`), with one `adult|child` ticket per person.

### Partner monthly reconciliation
The app produces a **per-partner monthly reconciliation statement** — NOT a fiscal invoice. The legal `račun` is issued by the secretary in their own accounting/fiscal tool (avoids fiskalizacija liability). The statement, viewable/exportable by admin and the partner, breaks down for the calendar month: tickets sold by show and type, cancelled (storno) count, **gross** (`sold × face value`), **commission** (gross × partner `commissionPercent`, Kaleta 10%), and **net payable**. Period is bucketed by **sold date** (`order.created_at`); because storno is same-day-only, the month-end active-ticket count is already final.

### Partner stats
The partner's scoped dashboard shows only **their own** sales: season total tickets sold, per-show counts, and the **last few sales** (recent list). No other partner's data, no PII beyond their own sales, no org-wide revenue. Reuses the stats query layer, filtered by `orders.partner = <self>`.

### Storno (partner cancellation)
A partner can cancel a ticket it sold, but only **on the same calendar day it was sold** (NOT the show day), in **Europe/Zagreb** local time. Example: Kaleta sells on 3 June a ticket for the 7 June show — they may storno it on 3 June only. This bounds cancellations to the same business day, before monthly settlement; it removes the ticket from the invoice count and frees the seat. After that day the sale is final for invoicing.

**Actor & granularity:** **partner self-service** from their dashboard — they may void an **individual ticket** or the **whole sale** (the order's tickets), same-day-only and **server-enforced** against `order.created_at` (never client-trusted). An **admin can storno anytime** (not bound to the same-day window) for corrections. Voiding uses the soft-cancel mechanism (`tickets.status = cancelled`, `reason = storno`).

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

### Scanned (people)
The "Scanned" number on the dashboard counts **people through the door**, not orders or tokens. After the "one QR per order" rule, a single scanned token represents an entire party; the number that actually matters to door staff is the seat-equivalent count.

Computed via JOIN: `SELECT COALESCE(SUM(o.adult_count + o.child_count), 0) FROM orders o JOIN qr_tokens q ON q.order_id = o.id WHERE o.show = $1 AND q.scanned = true`. Apples-to-apples with `onlineSold` (also seat-based) so `onlineSold − scanned = people still expected to arrive`.

**Per-show drill-down `/admin/stats/[showId]`:**
- For `tehnika`: bigger numbers only — online, in-person, scanned (people), remaining. **No revenue.** No order list.
- For `admin` and `superadmin`: numbers (including revenue) + full order list (buyer name, email, ticket count, per-QR scanned/unscanned state). Used to find a specific buyer's order on demand.
