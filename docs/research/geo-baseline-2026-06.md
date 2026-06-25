# GEO baseline — June 2026 (pre-changes)

The "before" snapshot for the GEO programme in `docs/geo-strategy.md` (§6 measurement). Captured **2026-06-25**, *before* any GEO change shipped (FAQ, schema enrichment, llms.txt) and on the **same day as the 301 cutover** (`korcula-moreska.com` → `moreska.eu`). Re-run monthly against this.

**Test prompt (all engines):** *"What is the Moreska sword dance and where can I see it in Korcula, and how do I get tickets?"* (ASCII spelling — how most tourists type it). Highest commercial intent: definition + venue + booking.

## ⚠️ Method caveat — personalization contamination
The ChatGPT and Claude runs were on Josip's **logged-in** accounts, which carry memory/personalization (he lives in Korčula, runs rental businesses). Claude literally tailored its answer to *"if this is for your rental guests."* **Treat the logged-in results as a personalized upper bound, not what a cold tourist sees.** The trustworthy cold signals are the logged-out engines (Google, Perplexity). Next baseline should use **ChatGPT Temporary Chat** + a logged-out window where possible.

**Update (same day):** the ChatGPT **Temporary Chat** re-run (cold, memory off) was completed — see the cold row below. It **confirms moreska.eu surfaces, is labelled "Official Tickets," and is listed FIRST even without personalization** (competitor moreska.hr appears as a secondary ticket option). So for ChatGPT the contamination concern is largely mitigated; the personalized run added framing ("your rental guests") but the core moreska.eu citation held cold.

## Results

| Engine | Session | moreska.eu surfaced? | Names a booking site? | Accuracy | Notes |
|---|---|---|---|---|---|
| **Google** (classic SERP) | logged-out | ❌ absent from page 1 | — | n/a | Competitor **moreska.hr present** p1; rest = visitkorcula.eu, kaleta.hr, korculainfo, TripAdvisor. No AI Overview triggered. |
| **Perplexity** | logged-out | ❌ | ❌ names none | vague | Generic answer; "two factions", "Mon/Thu", no price; *offers to go find the official booking page* (doesn't know one). |
| **ChatGPT** (web search on) | logged-in (personalized) | ✅ **named "official Moreška website" + "Moreška Tickets" link** | ✅ moreska.eu #1 | fully correct | €20/€10/under-4 free; Ljetno kino→Culture Centre; 9 PM; White/Black King + Bula + 7 fights; pulled show photos; cited "Moreška by HGD Sveta Cecilija". |
| **Claude.ai** (web search on) | logged-in (personalized) | ❌ | ❌ generic "online/agencies" | mostly correct, 1 gap | Cited the **OLD domain korcula-moreska.com**, not moreska.eu; **missed €10 child price** (only €20 adult); leaned on visitkorcula.eu month pages. Good kumpanjija-vs-Moreška distinction. |
| **ChatGPT** (Temporary Chat) | **cold (memory off)** | ✅ cited + "Official Tickets" listed **FIRST** | ✅ moreska.eu #1, moreska.hr #2 | fully correct | Full pricing (under-4 free / €10 / €20); Ljetno kino→Culture Centre; 9 PM; June–Oct; St Theodore; show photos + a Google "Dance company 4.5" place card. Competitor moreska.hr offered as secondary ticket option. |

## Takeaways

1. **Mixed cold picture — engine-dependent (and better than first feared).** On cold Google organic and Perplexity, moreska.eu is absent / unnamed, and Claude's web search cited the *old* domain. **But cold ChatGPT (Temporary Chat) already surfaces moreska.eu, labels it "Official Tickets," and lists it FIRST** (moreska.hr second) — so the most-used consumer AI engine reaches the site even without personalization. The gap is concentrated in **Perplexity** (names no site), **Google organic** (absent), and **Claude** (old domain). The competitor moreska.hr + aggregators (visitkorcula.eu, TripAdvisor) still co-own the space. GEO gap is real, winnable, and partly already being won on ChatGPT.
2. **The migration is the current GEO bottleneck.** Claude's web search found **`korcula-moreska.com` (old)**, not moreska.eu — expected, since the 301 cutover happened the same day and AI engines read search indexes that still point at the old domain's accrued equity. **Getting moreska.eu crawled/indexed fast is the single highest-impact GEO action right now** — it's what moves AI citations off the dead domain onto moreska.eu.
3. **The structured-facts gap is concrete and cheap to close:** prices (Claude missed the child price; Perplexity had none), exact schedule, and a single authoritative booking URL. This is exactly what the FAQ + entity schema (PR #308) + `/tickets` clarity are for.
4. **ChatGPT proves the ceiling:** when an engine *does* reach moreska.eu, it produces the ideal answer (named official site + correct prices + ticket link). The job is to make that the cold-session default, not the personalized one.

## Wikipedia / Wikidata state (off-site lever, `geo-strategy.md` §4.3)

- **Wikipedia "Moreška"** ([Q3497322](https://en.wikipedia.org/wiki/More%C5%A1ka)): does **not** mention HGD Sveta Cecilija; **no** link to moreska.eu or korcula-moreska.com (external links are generic tourism sites); carries none of the specific dates (1666/1883). Correctly distinguishes town Moreška from village Kumpanjija.
- **Wikidata [Q3497322](https://www.wikidata.org/wiki/Q3497322)**: very sparse — only *instance of (type of dance)*, *subclass of (sword dance; Croatian folk dance)*, *Commons category*, *Freebase ID*. **Missing:** country, location, inception, heritage designation, official website, organizer.
- **HGD Sveta Cecilija**: **no Wikipedia article and no Wikidata item.** (The other performing group is "Moreška – KUD Korčula", behind moreska.hr.)

### Recommended Wikidata actions (factual, low-COI — campaign manager, with a real account)

**A. Create a new item: "HGD Sveta Cecilija"** (Hrvatsko glazbeno društvo Sveta Cecilija)
- instance of (P31) → music society / cultural organization
- inception (P571) → 1883
- located in (P131) → Korčula (town) · country (P17) → Croatia (Q224)
- official website (P856) → `https://moreska.eu`  ← this is the defensible home for the official-site link (the dance itself has two performing groups, so the URL belongs on the org, not on Q3497322)
- *(optional)* social media: P2013 Facebook, P2003 Instagram, P2397 YouTube channel ID
- Each statement needs a reference (use korcula.hr municipal pages, korculainfo, tourist-board pages).

**B. Enrich Q3497322 (Moreška)** with referenced statements:
- country (P17) → Croatia (Q224)
- located in / location (P131/P276) → Korčula (town) — confirm the exact item in the Wikidata search box
- heritage designation (P1435) → "protected cultural good of the Republic of Croatia" (pick the matching designation item)
- *(optional)* inception or "earliest record" qualifier referencing the 1666 town-journal record

> Wikidata statements are plain facts with citations; COI rules are light (just use a registered account and add sources). This is the fastest, highest-GEO-yield off-site step — LLMs ingest Wikidata heavily.

### Wikipedia — COI-safe Talk-page edit request (ready to paste)

Do **NOT** edit the article directly as the subject. Post this on [Talk:Moreška](https://en.wikipedia.org/wiki/Talk:More%C5%A1ka) from an account that **discloses the COI on its user page**, and let an independent editor action it:

> **Edit request (COI-disclosed):** I'm connected to HGD Sveta Cecilija, one of the societies that performs the Moreška, so I'm requesting rather than making these edits.
> 1. The article doesn't currently note the institutional stewards of the dance. HGD Sveta Cecilija (Croatian Music Society St. Cecilia, founded 1883) and KUD Korčula are the two Korčula-town groups that perform the Moreška through the summer season. Suggested supporting sources: korcula.hr (municipal), korculainfo.com, and the Korčula Tourist Board (visitkorcula.net).
> 2. Suggested External link: the official site of HGD Sveta Cecilija's Moreška performances, `https://moreska.eu`.
> Happy to provide additional independent sources on request.

**The real lever (campaign manager):** get *independent* reliable sources (tourist board, regional news, academic write-ups) to reference HGD + moreska.eu by name. Wikipedia editors cite those; that's what makes the addition stick and what propagates into LLMs.

## Re-test protocol (monthly)

1. Run the test prompt on **Google, Perplexity, ChatGPT (Temporary Chat), Claude (web search on)**. Add **Google AI Overviews** + **Bing Copilot** if time.
2. Record per engine: mentioned? moreska.eu cited/linked? accurate (price, venue, time)? recommended for booking? competitor (moreska.hr / KUD) shown instead?
3. Watch GA4 for referrals from AI domains (`chatgpt.com`, `perplexity.ai`).
4. Compare to this baseline; note movement after (a) moreska.eu indexing post-cutover, (b) FAQ + schema (#308) live, (c) any Wikidata/Wikipedia changes.

### Sources consulted
- [Moreška — Wikipedia](https://en.wikipedia.org/wiki/More%C5%A1ka) · [Moreška — Wikidata Q3497322](https://www.wikidata.org/wiki/Q3497322)
- Engine outputs captured live 2026-06-25 (Google, Perplexity, ChatGPT, Claude.ai).
