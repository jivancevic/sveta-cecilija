# CONTEXT.md — HGD Sveta Cecilija / moreska.eu

## Glossary

### URL structure
No locale prefixes in URLs. `/tickets`, `/about`, etc. — not `/en/tickets`. The `[locale]` folder routing is removed. Language is resolved on first visit from `accept-language` headers (Croatian browsers → HR, everything else → EN) and persisted in a cookie (`moreska_locale`). The language switcher updates the cookie and reloads the same URL. Server reads the cookie on each request to pick translations.

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

### Croatian capitalisation: moreška
"moreška" and its declensions (moreške, morešku, moreškom…) are always **lowercase** in Croatian — it is a common noun (a type of dance), not a proper name. Use uppercase only when it begins a sentence. In English, "Moreška" is treated as a proper name and capitalised throughout.

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
