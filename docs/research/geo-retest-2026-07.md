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
| **ChatGPT** (Temporary Chat, memory off) | cold | _[fill in]_ | _[fill in]_ | _[fill in]_ | June cold: cited moreska.eu "Official Tickets" FIRST, full pricing correct. Confirm it held/improved. | |
| **Perplexity** | logged-out | _[fill in]_ | _[fill in]_ | _[fill in]_ | June: named no site, no price. Watch for moreska.eu / FAQ pickup. | |
| **Google** (classic SERP + AI Overview) | logged-out | _[fill in]_ | _[fill in]_ | _[fill in]_ | June: moreska.eu absent p1; moreska.hr present; no AI Overview. Check if AI Overview now triggers + who it cites. | |
| **Claude.ai** (web search on) | logged-out / Temporary | _[fill in]_ | _[fill in]_ | _[fill in]_ | June logged-in: cited OLD domain, missed €10. Recheck now that moreska.eu is indexed. | |

> Rows marked _[fill in]_ need a human cold session (Josip). The Claude-web-search row above is this session's tool — a useful cold-retrieval proxy for **"is moreska.eu indexed and does the synthesis still prefer old domains,"** but it is NOT the consumer ChatGPT/Perplexity signal that matters for tourists.

## Takeaways (July)
1. **Indexing is landing; synthesis lags.** moreska.eu is now in the index and surfaced, but at least one engine still *synthesizes ticket guidance from the old domain + moreska.hr*. The dead-domain citation problem is migrating from "not indexed" to "indexed but out-weighed by legacy equity." Expected; resolves as the 301 equity transfers and FAQ content accrues links/freshness.
2. **The structured-facts gap persists in answers** (€10 child price, single booking URL, correct venue/time). The FAQ was published *today*, so this is the pre-FAQ reading. **The August re-test is the real test of whether the FAQ moved the €10-price / booking-URL facts into cold answers.**
3. **Off-site lever is the untouched high-yield step.** Wikidata + Wikipedia still carry zero HGD/moreska.eu signal. LLMs ingest Wikidata heavily; actioning the ready-to-paste statements in the baseline doc (§Wikidata actions) is the biggest remaining non-dev GEO move and is fully independent of the dev work.

## Action items surfaced by this re-test
- [ ] **Josip:** run the 4 human cold rows above (ChatGPT Temporary Chat, Perplexity, Google, Claude.ai) and fill the table.
- [ ] **Josip:** check GA4 for referrals from `chatgpt.com`, `perplexity.ai`, `gemini.google.com` since cutover (AI-assisted-conversion signal).
- [ ] **Campaign manager (non-dev):** action the Wikidata statements + Wikipedia Talk-page request from `geo-baseline-2026-06.md` — still 0% done and highest off-site yield.
- [ ] **Next re-test: August 2026** — first read with the FAQ having had ~1 month to be crawled. Watch specifically for the €10 child price and a single moreska.eu booking URL appearing in cold answers.

### Sources consulted
- Claude web search on the test prompt, live 2026-07-14 (surfaced moreska.eu + visitkorcula + moreska.hr + korculainfo; synthesis cited korcula-moreska.com + moreska.hr).
- [Moreška — Wikidata Q3497322](https://www.wikidata.org/wiki/Q3497322) (re-checked 2026-07-14: still no P17/P856/HGD).
