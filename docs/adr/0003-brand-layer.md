# ADR-0003: Consumer-facing brand layer "Moreška by HGD Sveta Cecilija"

**Status:** Accepted
**Date:** 2026-05-24

## Context

HGD Sveta Cecilija is a 143-year-old cultural society from Korčula. Legally and historically the org is **HGD Sveta Cecilija**; one of its activities is performing the Moreška sword dance.

A competing cultural society in Korčula (`moreska.hr`) also performs Moreška, on different days. To a tourist these are interchangeable products — same dance, same town. moreska.hr has captured the literal "Moreška" identity in search and on Google Maps:

- They own the `moreska.hr` domain (exact-match, ccTLD).
- They own the only Google Business Profile result for "moreska" in Korčula.
- Their site brands explicitly as **"Moreška Korčula"** — the experience name.
- HGD's old site (`korcula-moreska.com`) brands explicitly as **"HGD sv. Cecilija"** — the organisation name. This wins for HGD-curious search but loses for product-curious search ("moreska tickets").

A tourist Googling "moreska korcula tickets" is looking for the *experience*, not the organisation. The competitor is positioned to capture that intent. HGD is not.

## Decision

Use **"Moreška by HGD Sveta Cecilija"** as the consumer-facing brand layer across moreska.eu, advertising, social, and review platforms. Keep **HGD Sveta Cecilija** as the legal entity name in all formal contexts (Payload CMS Users, contracts, invoices, footer "© HGD Sveta Cecilija").

Adopt the tagline **"The Original Moreška, performed since 1883"** for ad copy, hero subtitles, and meta descriptions.

Mechanically:
- `<title>` and OG metadata on pages: lead with "Moreška by HGD Sveta Cecilija" (e.g. `"Moreška Korčula Tickets | Moreška by HGD Sveta Cecilija"`).
- Hero h1: keep visual lockup; subtitle leans on heritage line.
- TripAdvisor listing: keep current generic "Moreska Sword Dancing" name (it's category-defining); description leads with HGD branding.
- Google Business Profile: register under **"Moreška – HGD Sveta Cecilija"** (distinct enough from competitor's listing to avoid auto-merge).
- Schema.org `Organization`: `name: "HGD Sveta Cecilija"`, `alternateName: "Moreška by HGD Sveta Cecilija"`.
- Ad copy: "Moreška by HGD Sveta Cecilija — Korčula's Original Sword Dance Since 1883".

## Alternatives considered

1. **Keep pure HGD branding** (status quo). Loses keyword space for the high-intent "moreska" search forever.
2. **Full rebrand to "Moreška Korčula"** (mirroring competitor). Conflicts directly with their branding, confuses tourists, dilutes 143-year HGD heritage, possible trademark/civic friction in a small town.
3. **Use just "Moreška" with HGD relegated to footer.** Sacrifices the org's identity and the "since 1883" differentiator — heritage is HGD's only structural advantage over the competitor.

## Consequences

- **Pro:** Reclaims share of voice on the experience keyword while preserving heritage as a differentiator.
- **Pro:** Heritage line ("since 1883") is a moat the competitor can't easily copy; it justifies a premium positioning that protects against price pressure.
- **Pro:** Distinguishes the new Google Business Profile from the competitor's, reducing auto-merge risk.
- **Con:** Two layers of naming require discipline across surfaces. Add to a CONTEXT.md glossary entry so future contributors don't drift back to single-name branding.
- **Con:** Hard to reverse cleanly — once "Moreška by HGD Sveta Cecilija" is in metadata, social bios, and ad accounts, changing again confuses both Google and humans.

## Related

- `docs/marketing.md` — implementation of brand layer across channels
- ADR-0001 — locale URL prefix removal (the decision that constrained SEO to one language)
