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

### Ticket scan authorization
The `/scan/[token]` URL is **shared by buyers and door staff** — same URL, different behaviour based on auth:

- **Unauthenticated visit (buyer tapping their own QR from email):** Renders ticket details — buyer name, show date/time/venue, ticket counts — plus the QR re-rendered on-page so the buyer can show their phone screen at the door. **Does NOT mark the token as scanned.** A prominent notice reads "Show this screen at the door — do not tap the QR again."
- **Authenticated visit by a `door-staff` (or `admin`) user:** Atomically marks the token scanned (or shows ALREADY_SCANNED with timestamp) and the VALID screen.

This split exists because buyers used to burn their own tickets by tapping the link to "check it works". The atomic mark-and-read race-safety still applies — only one staff scan can win for a given token.

### Door-staff role
A restricted Payload user role. One shared `door-staff` account (e.g. printed on a card for whoever works the door). Permissions:
- Can authenticate `/scan/[token]` for atomic mark-as-scanned
- Can view `/admin/stats` (the Stats dashboard) and per-show drill-down with non-PII counts only
- **Cannot** see customer emails, order details, or issue refunds — those are admin-only

Password rotation is a one-off Payload admin edit when leaked. No per-volunteer accounts; HGD is too small to justify the onboarding overhead.

### Undo-scan window
On the ALREADY_SCANNED page, an authenticated `door-staff` user sees an "Undo scan" link if the scan was within the last **2 minutes**. Clicking it sets `scanned = false` again. This covers honest misclicks at the door without opening abuse vectors (no late-night "let my friend back in" undo).

### Stats dashboard
Lives at `/admin/stats`. Visible to `door-staff` and `admin`.

**Top of page — season aggregate:** total tickets sold (online + in-person), total scanned, total revenue (EUR), broken down by venue.

**Body — show list:** one row per upcoming show + today + last 7 days of past shows. Columns: date, venue, capacity, online sold, in-person sold, scanned, remaining. Force-dynamic — refreshes on each page load (no polling). Past shows beyond 7 days are reachable from a "Browse all shows" link that filters/paginates.

**Per-show drill-down `/admin/stats/[showId]`:**
- For `door-staff`: bigger numbers only — online, in-person, scanned, remaining, revenue. No order list.
- For `admin`: numbers + full order list (buyer name, email, ticket count, per-QR scanned/unscanned state). Used to find a specific buyer's order on demand.
