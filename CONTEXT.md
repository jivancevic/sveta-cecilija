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

### One QR per order
Each order gets exactly **one** `QRTokens` row, regardless of how many tickets the buyer purchased. The buyer receives one A4 PDF page in their confirmation email; the PDF shows the ticket count ("4 tickets — 3 adults, 1 child") as a label. Adult vs child is not tracked per-token; it is an order-level breakdown derived from `orders.adult_count` / `orders.child_count`.

Reasons: simpler buyer artefact (one page, not four), simpler door-staff workflow (one scan admits the entire party), and the dashboard's "Scanned" metric maps cleanly to "orders walked in" without needing a per-seat denominator. Supersedes the original "N tokens per order, first M = Adult" model from ADR-0005 — see that ADR's Amendment section.

Schema is unchanged (`QRTokens` still keys on `token` and links to one order); only the write loop in `handle-payment-succeeded.ts` collapses from `for (let i = 0; i < total; i++)` to a single insert.

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
