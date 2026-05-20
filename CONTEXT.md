# CONTEXT.md — HGD Sveta Cecilija / moreska.eu

## Glossary

### URL structure
No locale prefixes in URLs. `/tickets`, `/about`, etc. — not `/en/tickets`. The `[locale]` folder routing is removed. Language is resolved on first visit from `accept-language` headers (Croatian browsers → HR, everything else → EN) and persisted in a cookie (`moreska_locale`). The language switcher updates the cookie and reloads the same URL. Server reads the cookie on each request to pick translations.

### Language switcher
Always renders `HR · EN` (fixed order, HR left). Active language shown in a distinct colour (gold); inactive is dimmed. Switching: save `window.scrollY` to `sessionStorage`, set `moreska_locale` cookie, reload — on mount, read `sessionStorage` and `window.scrollTo` to restore position.

### Summer Cinema (Ljetno kino)
The outdoor venue in Korčula where Moreška performances are held. Google Maps: https://maps.app.goo.gl/bVYpoQAHw6sixyYk9

A venue info block appears at the top of the tickets page, containing:
- Location name + Google Maps link (text link, no embedded map)
- Show duration: 1 hour
- Programme order: klapa performance first, then Moreška with live wind orchestra

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
