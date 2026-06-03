# Marketing & SEO — moreska.eu

Living doc for the 2026 season marketing plan. Sister doc to `docs/niche.md` (legacy-migration decisions) and the SEO-related ADRs in `docs/adr/`.

## Strategic context (2026 season)

- **Domain age:** moreska.eu is brand-new; organic ranking won't materialise in time for 2026 season. Old domain `korcula-moreska.com` stays live read-only with banner → moreska.eu until Oct 2026, then 301-redirects per the migration plan.
- **SEO horizon:** 2026 = lay foundations (metadata, Schema.org, GBP, reviews, content). 2027 = harvest organic rankings post-301-cutover.
- **Paid acquisition this season is essentially the only direct channel to moreska.eu** — old-domain banner does the rest.
- **Competitor:** `moreska.hr` (the other Korčula Moreška group). Performs different days, same product to a tourist, currently outranks HGD on most "moreska" searches and owns the Google Maps result. Not on friendly terms.
- **SEO scope: English only.** Cookie-based locale prevents indexable HR/DE/IT URLs (see CONTEXT.md "URL structure").

## Sell-through baseline (for ROI math)

Rough 2025 estimates (validate against real Shows data when available):
- Off-season: ~120/320 seats sold per show (~38%)
- Full season: ~250/320 seats sold per show (~78%)
- Competitor moreska.hr consistently runs near-full — strong signal that demand exists, capture is the problem.
- Foregone revenue per show: ~€3,600 off-season, ~€1,260 full season.

## Budget

- **Target:** €500/mo May–October 2026 (~€3,000/season). Start lean (€200/mo) and scale on measured payback.
- **Anchor on ROAS, not on monthly spend.** If €1 → €3 out, spend more. Track in GA4 + ad platform reporting.

## Channels

### Owning-email convention (info@ vs pr@)

Which HGD email registers each listing determines who can manage it long-term. Set this deliberately, because ownership transfers on these platforms are painful.

- **`info@moreska.eu`** is for operational / transactional accounts. Brevo sends from it, ticket + contact replies land here, and **Google Business Profile** is already registered to it (transferred 2026-05-26, with josip.ivancevic00@gmail.com as backup).
- **`pr@moreska.eu`** is for outward marketing listings owned long-term by the HGD campaign manager rather than the developer: **TripAdvisor** (#35), OTAs (#39), and any future review/press platforms. Register the listing's business account under this alias so ownership re-points by changing the ImprovMX forwarding target, not by recovering a personal account.

Both are ImprovMX forwarding aliases (no real mailbox), so adding one is near-zero cost. Verification on these platforms is normally phone-based (`+385 92 1532305`), so the email domain does not need to match the listed website. GBP staying on `info@` is the one intentional exception to "marketing goes on pr@"; keep *new* marketing listings on `pr@` so the split stays clean.

### 1. Google Business Profile (HIGHEST PRIORITY — 2-week lead time)

- **Current state:** moreska.hr owns the only "moreska" Maps result in Korčula. HGD is invisible to in-destination tourists.
- **Action:** Create GBP under distinct name (suggested: **"Moreška – HGD Sveta Cecilija"** or **"Moreška by Sveta Cecilija (since 1883)"**) to avoid auto-merge with competitor's listing.
- **Primary address:** Ljetno kino (the venue, where tourists go), not the HGD office.
- **Category:** Performing arts theater / Cultural attraction.
- **Verification:** postcard to physical address; takes ~2 weeks. **Start today.**
- **Post-verification:** photos, weekly post with show date, FAQ, booking link to moreska.eu.

### 2. TripAdvisor (CLAIMED — owned by `pr@moreska.eu`)

- **Listing:** [Moreska Sword Dance, d1898279](https://www.tripadvisor.com/Attraction_Review-g1007309-d1898279-Reviews-Moreska_Sword_Dancing-Korcula_Town_Korcula_Island_Dubrovnik_Neretva_County_Dalma.html), ~200 reviews / 4.3 stars, #1 of 1 Theater & Concerts in Korčula Town.
- **Status:** claimed via the TripAdvisor Owners portal under `pr@moreska.eu` (#35 closed). Hours, photos, and description set in the Management Center. Ongoing review responses / photo curation belong to the HGD campaign manager (re-point the `pr@` alias to hand off).
- **Name kept generic on purpose:** "Moreska Sword Dance" (ASCII spelling; "Sword Dance" not "Sword Dancing"). Do NOT rebrand to "HGD Sveta Cecilija": the ~200 reviews are shared with the competitor's performances (tourists don't distinguish groups), so a generic name we control captures all that equity, and an org-rebrand would invite a misrepresentation dispute. The "Moreška" diacritic lives in the description/prose, not the name (the name doubles as a search hook and matches the ASCII domain).
- **Deferred:** swap the listed website from korcula-moreska.com to moreska.eu only after the DNS cutover (#11) is live and stable. Tracked there, not on #35.
- **Follow-up:** mine the ~200 reviews for experience improvements, see #124.

### 3. Reviews velocity (highest-ROI ongoing activity)

- **Today:** ~200 TripAdvisor reviews accrued passively over ~10 years.
- **Target:** 3–5× velocity in 2026 season via active solicitation.
- **Tactics:**
  - **QR card handed at exit by door staff:** front side "Loved the show? Review us →" + QR linking to TripAdvisor review form. Back side same QR linking to Google review form. Print ~500, give to door staff.
  - **Follow-up email** 2h after performance (post-ticket-purchase, via Brevo) with two big buttons: "Review on TripAdvisor" / "Review on Google". Subject line "How was Moreška?" One-click unsubscribe (List-Unsubscribe header) persists across future shows.
  - **Door staff script:** one-line ask at exit, "If you enjoyed the show, please scan this to leave a quick review." Requires staff buy-in — train at season start.
- **Don't:** offer incentives for reviews (Google + TripAdvisor TOS violation, can get listings delisted).

### 4. Google Ads — paid search (largest paid channel)

- **Budget allocation:** ~€300/mo of the €500 total.
- **Campaign 1: branded + bottom-funnel keywords.**
  - "moreska tickets", "moreska korcula tickets", "moreska korcula", "moreska sword dance tickets", "korcula sword dance show tickets"
  - **Date-modifier keywords:** "moreska korcula august 14", "moreska korcula tonight" — match these to your actual show dates dynamically if possible
  - Match types: phrase + exact, NOT broad
  - Geo: worldwide (people plan trips from anywhere) + bid boost for Croatia/Korčula
  - Ad copy emphasise: "Performed since 1883", "Live wind orchestra", show schedule, direct booking
- **Campaign 2 (contentious but legal in EU): competitor brand bidding.**
  - Bid on "moreska.hr", "moreska korcula tickets moreska.hr", competitor name
  - Don't use their brand in ad copy (legal grey area) — just in keyword targeting
  - Ad copy: "Performances Mon/Thu — book Korčula's Original Moreška since 1883"
  - Low budget cap (~€30/mo) — defensive play to capture cross-shoppers
- **Ad extensions:** Sitelinks (Tickets, About, Schedule), structured snippets (Venue, Show dates), callout extensions ("Live music", "Since 1883").
- **Tracking:** GA4 + Google Ads conversion tracking on `/checkout/[showId]/confirmation`.

### 5. Meta (Facebook + Instagram) — retargeting layer

- **Budget allocation:** ~€150/mo.
- **Audience:** retargeting only — people who visited moreska.eu but didn't reach confirmation page within 14 days. Tight audience, low CPM, high relevance.
- **Creative:** short video clip from show + tonight's/this-week's date + "Book now" CTA.
- **Don't do interest-based prospecting yet** — too broad for €150/mo budget, wait until base channels are profitable.
- **Pixel:** install Meta Pixel on moreska.eu, fire `Purchase` event on confirmation page with value.

### 6. Viator / GetYourGuide — OTA channel

- **Decision:** open to listing (subject to unit economics).
- **Commission:** typically 20–30%. At €20 adult ticket: ~€14–16 net.
- **Rate parity:** must offer same price as on moreska.eu. **Do NOT raise prices to offset commission** — contract violation, and backfires on cross-shoppers.
- **SKU strategy:** create a *differentiated SKU* on OTAs (e.g. "Moreška + welcome drink + reserved front-row seats" at €30, netting ~€22 after commission). Parity rules don't apply to differentiated products.
- **Mental model:** commission is customer acquisition cost for tourists who'd never have found moreska.eu — not a tax to recover.
- **Lead time:** 2–4 weeks to list, longer if Viator wants approval calls.

### 7. Content / blog (slow but durable — 2027 payoff)

- **Cadence:** 1 long-form post/month (800–1,200 words), HGD-produced.
- **Suggested first 6 posts** (target informational queries that ads can't profitably bid on):
  1. "What to expect at a Moreška performance in Korčula"
  2. "The history of Moreška — 400 years of sword dance"
  3. "Is Moreška suitable for kids?" (parent search query, high-intent)
  4. "Moreška vs Kumpanjija — Korčula's two sword dances explained" (honest comparison; captures competitor-curious search)
  5. "What to do in Korčula in the evening" (broader tourist intent, links internally to /tickets)
  6. "Behind the scenes — meet the HGD Sveta Cecilija dancers"
- **Format:** include hero image, structured H2/H3, internal links to /tickets and /about, schema markup (Article or BlogPosting + Organization).
- **Don't:** write keyword-stuffed thin content. Google penalises it; tourists bounce.

## Brand positioning

See **`docs/adr/0003-brand-layer.md`** for the full rationale. Short version: use **"Moreška by HGD Sveta Cecilija"** as the consumer-facing brand layer (tagline: *"The Original Moreška, performed since 1883"*) while keeping HGD Sveta Cecilija as the legal entity. Reclaims keyword space currently owned by competitor without rebranding the organisation.

## Measurement

Wire all four before any spend:
1. **GA4** — page views, conversion events (`begin_checkout`, `purchase`), traffic sources
2. **Google Search Console** — index coverage, queries, click-through rate, position
3. **Google Business Profile insights** — searches, calls, direction requests, photo views
4. **Ad platform reporting** — Google Ads + Meta Ads dashboards

Monthly review: total moreska.eu sessions, ticket revenue attributed by channel, ROAS by campaign, review velocity (new reviews/month). Kill underperforming campaigns at 90 days.

## What we are NOT doing (and why)

- **German/Italian SEO** — locked out by cookie-based locale architecture; only EN indexable. Re-evaluate post-2026 if business case grows.
- **Hreflang tags** — same reason; nothing to point at.
- **YouTube pre-roll, influencer seeding, TikTok ads** — out of budget at lean tier. Revisit if 2026 paid channels prove profitable.
- **B2B / private-show ads** — services are agency-booked, no need to promote publicly.
- **Cross-order loyalty / repeat-buyer email nurture** — out of scope for a once-in-a-lifetime tourist attraction.

## Domain: moreska.com (deferred to 2027 season)

**Status:** Listed for sale at ~$5,650 (seller's floor after two HGD counter-offers). Decision: **defer purchase to 2027 season** to preserve 2026 cash for paid acquisition.

**Strategic rationale:**
- `.com` is the strongest possible domain for the keyword "moreska" — beats both moreska.eu and competitor's moreska.hr for EN-language SEO/CTR.
- Defensive value dominates the math: if moreska.hr or a tour operator buys it first, recovery cost likely $15–20k+.
- Payback at $5,650 ≈ €5,200 = ~1 incremental near-sellout show.
- But: 2026 budget is tight, and the second migration risk (Stripe/Brevo/ImprovMX all wired to moreska.eu) means a second domain switch mid-season is operationally heavy.

**Decision: park decision until post-2026 season.** When/if acquired:
- moreska.eu stays canonical (no re-migration of the live stack).
- moreska.com 301-redirects sitewide to moreska.eu.
- `info@moreska.com` alias forwards same as `info@moreska.eu`.
- Only consider switching canonical to .com if there's a deliberate quiet window (no other migrations in flight).

**Risk hedges in place during the wait:**
- Monthly check on the for-sale listing (price changes, sold status).
- No further contact with seller — additional contact signals commitment and raises the floor.
- If the listing disappears or competitor brand activity suggests they bought it: re-evaluate strategy immediately.

## Open coordination items

- [ ] Confirm Mon/Thu hours on TripAdvisor match actual HGD performances this season (some weeks are Mon/Wed per Josip).
- [ ] Get access to korcula-moreska.com Google Search Console + Analytics to inventory existing top keywords + backlinks before any redirect work.
- [ ] Decide whether to install Meta Pixel before paid spend begins (privacy/consent implications — needs to fire only after cookie consent acceptance).
