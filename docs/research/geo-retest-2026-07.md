# GEO re-test — July 2026 (first post-FAQ measurement)

First monthly re-test against [`geo-baseline-2026-06.md`](./geo-baseline-2026-06.md). Captured **2026-07-14**, ~3 weeks after the 301 cutover (`korcula-moreska.com` → `moreska.eu`) and the **same day the FAQ + FAQPage schema + `/about` copy went live** on moreska.eu. This is the "after indexing, at FAQ go-live" snapshot — expect FAQ effects to lag (engines must re-crawl and re-weight).

**Test prompt (all engines):** *"What is the Moreska sword dance and where can I see it in Korcula, and how do I get tickets?"* (unchanged from baseline; ASCII spelling as tourists type it).

## What changed since baseline
- **Indexing bottleneck clearing:** moreska.eu is now retrievable/indexed (baseline's #1 GEO action). It surfaces in cold result sets where it was absent in June.
- **FAQ live same day** (2026-07-14): 44 EN Q&A + FAQPage JSON-LD + `llms.txt`. Too fresh to expect citation lift yet — this is the "T0" for measuring FAQ impact next month.
- **Off-site levers unchanged:** Wikidata Q3497322 still sparse (no country/P17, no official website/P856, no HGD mention); no HGD Wikidata item; Wikipedia Moreška article still omits HGD + moreska.eu. Campaign-manager task, not yet actioned.

## Results

| Engine | Session | moreska.eu surfaced? | Names booking site? | Accuracy | Notes | vs June |
|---|---|---|---|---|---|---|
| **Claude web search** (this tool, cold proxy) | cold | ✅ **in result set** ("Moreška by HGD Sveta Cecilija") | ⚠️ synthesis still cites **korcula-moreska.com (old, 301'd) + moreska.hr** | stale facts | moreska.eu now *indexed & retrieved* (June: Claude cited only the old domain). But the synthesized answer STILL routes tickets to the old/competitor domains and repeats €20-only / "aged 14+" / "since 1571" / "originating in Spain". The **€10 child price + single authoritative booking URL still not propagating** into the answer body. | ⬆️ indexing, ⟳ synthesis still stale |
| **ChatGPT** (Temporary Chat, memory off) | cold | ✅ **cited as the primary source throughout** ("Moreška by HGD Sveta Cecilija") | ✅ "Official Moreška ticket booking" link; **moreska.hr NOT offered anymore** (June: secondary option) | fully correct | €20 / €10 (4–14) / under-4 free; Summer Cinema → Culture Centre rain fallback; ~1 h runtime; seven battles; 29 July St. Theodore's Day; Google place card "Dance company 4.5". Answer phrasing visibly tracks moreska.eu copy ("preserved in Korčula while it disappeared from most other Mediterranean locations"). | ⬆️⬆️ best-case answer, competitor dropped |
| **Perplexity** | logged-out session (Josip's browser) | ❌ **not even retrieved** — all 10 sources = 8× TripAdvisor + kaleta.hr + festandevent | ❌ names none ("local office or box office… hotel receptions") | stale/wrong | Quotes **"100 HRK (~12–13 EUR)"** — pre-euro price (Croatia switched 2023); vague "Mondays and/or Thursdays"; offers to go find the official page. **Root cause visible: its retrieval is TripAdvisor-review-dominated, and the TripAdvisor listing itself is stale.** | ⟳ unchanged (still the worst engine) |
| **Google** (classic SERP; ⚠️ logged-in as Josip, ads-owner view) | logged-in | ✅ **organic #2 (homepage) + #4 (/tickets, snippet shows "Adults €20, children €10")**; own paid ad shown | ✅ **visitkorcula.eu (#1) now lists moreska.eu/tickets FIRST**, moreska.hr second | correct in snippets | No AI Overview triggered (same as June). Paid campaign "Website traffic-Search-1 TEST" ELIGIBLE for this query, with a Google warning **"Set up conversion tracking"** on the Ads account → flag to the campaign owner. Logged-in caveat: personalization + advertiser view; organic ranking still indicative. | ⬆️⬆️ from absent-on-p1 to #2 + #4 |
| **Claude.ai** (web search on; logged-in, personalized) | logged-in | ✅ **"The official group HGD Sveta Cecilija sells online through moreska.eu"** — old domain GONE | ✅ moreska.eu named for online sales (visitkorcula.eu offered alongside) | 1 gap | Correct venue/time/rain fallback, 2026 season dates, St. Theodore's Day, both performing groups distinguished. **Still misses the €10 child price** ("Adult tickets (age 14+) are 20 EUR" only) — same gap as June, exactly what the FAQ targets. Personalized ("if this is for rental guests"), same caveat as June's row. | ⬆️ old-domain citation fixed |

> All four consumer rows were run 2026-07-14 in Josip's Chrome (ChatGPT via Temporary Chat = cold; Google + Claude.ai logged-in, personalization caveat noted per row; Perplexity session not signed-in-verified). The Claude-web-search row above is this session's tool — a cold-retrieval proxy, not a consumer signal.

## Takeaways (July)
1. **Three of five engines now cite moreska.eu — up from one in June.** ChatGPT (cold) treats it as the primary source and has *dropped* moreska.hr entirely; Claude.ai has replaced the dead korcula-moreska.com citation with moreska.eu; Google organic went from absent-on-p1 to #2 + #4 (with correct prices in the /tickets snippet) and the #1 aggregator (visitkorcula.eu) now routes its ticket link to moreska.eu first. The 301 + indexing work has landed.
2. **Perplexity is the isolated failure, and the root cause is now visible: TripAdvisor.** 8 of its 10 retrieved sources are TripAdvisor review pages quoting a pre-euro "100 HRK" price. moreska.eu isn't retrieved at all. The highest-yield fix is **off-site**: refresh the TripAdvisor listing (owner tools: correct prices in EUR, official website = moreska.eu, current venue text) — that feeds Perplexity directly. Belongs to the marketing-listings owner (#35/#36/#39 scope), not dev.
3. **The remaining on-site gap is narrow: the €10 child price.** Claude.ai still says "€20 (14+)" only; Claude web-search synthesis ditto. This is precisely what the FAQ (published today) encodes — **August's re-test is the FAQ-impact read.**
4. **Off-site levers (Wikidata/Wikipedia) still untouched** — zero HGD/moreska.eu signal on Q3497322. Now the single biggest remaining non-dev GEO move, alongside the TripAdvisor refresh.
5. **Google Ads side-finding:** the account shows "Set up conversion tracking" for the running search campaign — purchase conversions likely not linked/imported into Ads. Flag to the campaign owner (measurement correctness is dev-adjacent; the GA4 purchase event itself is verified live).

## Action items surfaced by this re-test
- [x] ~~Run the 4 human cold rows~~ — done 2026-07-14 (see table; Google/Claude rows carry a logged-in caveat).
- [ ] **Josip:** check GA4 for referrals from `chatgpt.com`, `perplexity.ai`, `gemini.google.com` since cutover (AI-assisted-conversion signal).
- [ ] **Marketing-listings owner:** refresh the **TripAdvisor listing** (EUR prices, moreska.eu as official site, venue text) — directly feeds Perplexity's retrieval.
- [ ] **Campaign manager (non-dev):** action the Wikidata statements + Wikipedia Talk-page request from `geo-baseline-2026-06.md` — still 0% done.
- [ ] **Ads owner:** resolve the Google Ads "Set up conversion tracking" warning (link GA4 purchase conversion to the Ads account).
- [ ] **Next re-test: August 2026** — FAQ-impact read. Watch specifically for the €10 child price appearing in Claude/Perplexity answers and for Perplexity retrieving moreska.eu.

### Sources consulted
- Claude web search on the test prompt, live 2026-07-14 (surfaced moreska.eu + visitkorcula + moreska.hr + korculainfo; synthesis cited korcula-moreska.com + moreska.hr).
- Consumer engine runs, live 2026-07-14 in Chrome: Google SERP (logged-in), Perplexity (perplexity.ai search), ChatGPT Temporary Chat, Claude.ai (Opus 4.8, web search).
- [Moreška — Wikidata Q3497322](https://www.wikidata.org/wiki/Q3497322) (re-checked 2026-07-14: still no P17/P856/HGD).
