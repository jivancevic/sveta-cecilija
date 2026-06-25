# GEO & FAQ Strategy — moreska.eu

Sister doc to `docs/marketing.md` (paid + classic-SEO plan) and `docs/sveta-cecilija.md` (history source). Covers **GEO** (Generative Engine Optimization — being surfaced by AI answer engines), the **FAQ surface**, and how the **blog and FAQ interlock** so the content programme is a strategy, not a pile of posts.

Decisions in this doc were taken with Josip on **2026-06-25** via a `/grill-with-docs` alignment session. Where a decision is hard to reverse or surprising, it's marked **[decided]**.

---

## 1. Strategic frame

**GEO** = optimizing to be *cited, quoted, and recommended* by AI answer engines (ChatGPT, Claude, Perplexity, Google AI Overviews / Gemini, Bing Copilot) — as distinct from *ranking* in a classic search-results page.

- **[decided] GEO is a near-term 2026 channel, not just a 2027 foundation.** This is the key departure from `marketing.md`, and the two are *both correct* because they describe different mechanisms:
  - `marketing.md` is right that **Google organic** won't rank moreska.eu in 2026 — organic ranking is gated on domain age and backlink authority, which a brand-new domain doesn't have until ~2027 (post-301-cutover).
  - **GEO is the exception.** AI engines synthesize answers from factual, well-structured, authoritative *content* and are far less gated on domain age / backlink volume. A **143-year-old institution with primary-source history** (`docs/sveta-cecilija.md`) is exactly the kind of entity an LLM cites confidently. This is the one discovery channel where being a new domain is **not** disqualifying — so we press it now.
- **[decided] Success metric = "cited / recommended in AI answers + assisted conversions," measured by periodic prompt-testing (§6) — NOT Google rankings.** We do not expect, and will not judge GEO by, search position.
- **Scope: English only** — same architectural constraint as SEO. Cookie-based locale (`src/proxy.ts`) means each URL is crawlable in exactly one language, and a cookieless crawler (Googlebot, GPTBot, ClaudeBot, PerplexityBot) always resolves to English. **HR content has no GEO value under the current architecture** (see CONTEXT.md "URL structure" and `marketing.md` §"SEO scope").
- **Competitor context:** `moreska.hr` (the other Korčula group) outranks HGD on most "moreska" searches and owns the Google Maps result. GEO is a flanking move — answer engines reward the most *authoritative and complete* source, which a 1883 institution with documented history can win even while behind on classic SEO.

## 2. Where we start (current state, from #41)

The blog/SEO infrastructure is already strong. Inventory (verified 2026-06-25):

- **Implemented:** `generateMetadata` + canonical on every public route; `metadataBase`; **Organization + Event + BlogPosting** JSON-LD; dynamic `sitemap.ts` (includes `/blog` + all published slugs); `robots.ts` (staging guard; **AI crawlers currently allowed** via the `userAgent: '*'` allow rule — nothing blocks LLM ingestion today); EN-only canonical strategy; `/blog` + `/blog/[slug]`; Posts CMS collection.
- **Gaps this strategy closes:** `FAQPage`, entity/`sameAs` enrichment, `llms.txt`, off-site entity (Wikipedia/Wikidata) presence. (BreadcrumbList and RSS remain out of scope — low GEO value.)

## 3. The FAQ surface

**[decided] Build a Payload-backed `/faq`.** New `faqs` collection (`question`, `answer`, `category`, `locale`, `order`, `status`) + a `/faq` route emitting **FAQPage JSON-LD** + sitemap entry. HGD edits answers without a developer.

- **Honesty caveat:** Google **deprecated FAQ rich-results for non-gov/health sites in 2023** — a `/faq` page will *not* produce the collapsible Q&A snippet in Google search. Its value is (a) **LLM extraction/citation** — Q&A is the single most machine-legible content format — and (b) **genuinely helping the deciding tourist**. We build it for those two reasons, not for a Google rich snippet.
- **Reuse, don't duplicate:** surface the most relevant Q&A *inline* on the pages where the question arises — practical questions on `/tickets`, identity/history questions on `/about`, kids questions on the kids blog post. Same content, contextual placement.
- **[decided] Language: EN now, HR later.** EN is the only crawler/LLM-visible surface; HR is a fast-follow for on-site Croatian/diaspora users via the `locale` field, and does not block the GEO build.
- **Seed:** the **50 real tourist questions** supplied by an HGD tourist-guide member (a guide who also runs the Moreška Experience, so the list reflects real visitor curiosity). Drafted EN answers live in `docs/faq-drafts/` (review-first, same discipline as `docs/blog-drafts/`).

## 4. The four GEO levers

### 4.1 Entity / schema enrichment — *dev, this codebase*
LLMs lean hard on structured entities. Strengthen the ones we emit:
- **Enrich the `Organization` JSON-LD** (`src/app/(frontend)/layout.tsx`): add `sameAs` for every authoritative profile (TripAdvisor [present], Google Business Profile, Facebook, Instagram, YouTube, **Wikipedia**, **Wikidata**); add `knowsAbout` (Moreška, sword dance, Korčula cultural heritage, klapa, wind orchestra); keep `foundingDate: 1883`; add `areaServed` / `location` (Korčula).
- **Add a dedicated entity for the dance itself** — a `CreativeWork`-type node describing the Moreška as a protected cultural good (`name`, `alternateName`, `inLanguage`, `locationCreated` = Korčula, `about`, `temporalCoverage`), so the *dance* becomes a queryable entity an LLM can attach facts to, not just the org.
- **`FAQPage` JSON-LD** on `/faq` (§3).

### 4.2 Extraction-first content rules — *standard, governs FAQ + blog*
The writing standard for every FAQ answer and future blog post:
1. **Lead with a direct, self-contained answer in sentence one** — definitional where possible ("Moreška is a traditional sword dance from the town of Korčula, Croatia…"). LLMs extract the first declarative sentence; bury the answer and you lose the citation.
2. **One claim per sentence;** include concrete dates, numbers, and proper nouns (1883, 1666, ~1 kg, seven battles).
3. **Phrase H2/H3 headings as the question a user actually asks.**
4. **Prefer lists/tables** for enumerable facts.
5. **Ground every factual claim in a source** (`docs/sveta-cecilija.md` / `docs/copywriting.md`); never invent. Unsupported claims get flagged for HGD, not written as fact.

### 4.3 Wikipedia / Wikidata workstream — *NON-DEV (campaign manager / HGD)*
**Highest off-site GEO lever.** LLMs weight Wikipedia and Wikidata enormously; presence there propagates into answers far beyond our own site.
- **Actions:** verify/improve the English **Moreška** Wikipedia article for accuracy; ensure the **Wikidata** item for Moreška exists, is accurate, and carries `official website` → moreska.eu and a link to HGD Sveta Cecilija; ensure **HGD Sveta Cecilija** has an accurate Wikidata item (founded 1883, located in Korčula, official website).
- **Constraint:** Wikipedia **conflict-of-interest** rules — HGD must **not** self-promote or edit as the subject. Use neutral, well-sourced edits, the article Talk page, and disclosed-COI process. Wikidata is more permissive for plain factual statements (official website, founding date, location).
- **Owner:** campaign manager / HGD. **This is not developer work** and is flagged as such.

### 4.4 `llms.txt` — *dev, experimental, cheap*
Add `/llms.txt` (the [llmstxt.org](https://llmstxt.org) format): a curated markdown index of key pages (home, `/tickets`, `/about`, `/faq`, the blog posts) with one-line descriptions, to help LLMs map the site.
- **Honest caveat:** the standard is **not officially honored by OpenAI, Anthropic, or Google as of early 2026.** Low cost, speculative payoff — ship it, but don't over-invest. Mark it experimental in the build.

## 5. Blog ↔ FAQ funnel (making the blog posts "make sense")

The blog and FAQ are **complementary, not redundant**:

| | FAQ | Blog |
|---|---|---|
| Length | 40–120 words, one question → one answer | 800–1,500 words, narrative |
| Job | Extraction-optimized fact + point-of-decision reassurance | Informational-search SEO + depth LLMs cite for richer answers + shareable |
| Format | Q&A, machine-legible | Story, H2/H3, hero image |
| GEO role | The literal answer an LLM quotes | The corpus an LLM synthesizes from |

- **They interlock by internal linking:** each FAQ answer that has a deeper story ends with "Read more →" to the matching blog post; blog posts link to `/faq` and `/tickets`. (Respect the hard rule: **no `/en` or `/hr` prefix on internal links.**)
- **The 50 questions validate the blog plan.** Mapping in `docs/faq-drafts/README.md`. The questions confirm 5 of the 6 planned topics and surface one candidate **7th topic** — *"Moreška around the world — HGD's international performances"* (driven by Q49) — but it needs an HGD-supplied list of tour countries before it can be written. Flagged, not assumed.

## 6. Measurement (GEO-specific)

Classic analytics (GA4, GSC, GBP) stay as in `marketing.md §"Measurement"`. GEO adds:

- **Monthly prompt-test protocol.** Run a fixed prompt set across **ChatGPT, Claude, Perplexity, Google AI Overviews/Gemini, Bing Copilot**. For each, record: (a) are we mentioned? (b) cited with a moreska.eu link? (c) accurate? (d) recommended for *booking*? Also log whether `moreska.hr` is mentioned instead.
- **Sample prompts** (English, tourist intent): "What is the Moreška sword dance?" · "Where can I see the Moreška in Korčula and how do I get tickets?" · "Is the Moreška suitable for kids?" · "best things to do in Korčula in the evening" · "Moreška vs Kumpanjija" · "who performs the Moreška in Korčula?" · "are the swords in the Moreška real?"
- **AI-referral watch:** monitor GA4 for referrals from AI domains (e.g. `chatgpt.com`, `perplexity.ai`) — increasingly appear as referrers when an LLM links a source.
- **Cadence:** log a monthly snapshot; review quarterly whether the content moved the needle. No paid GEO-monitoring tool at this scale — manual testing is sufficient.
- **Baseline:** the first snapshot (2026-06-25, pre-changes, same day as the 301 cutover) is `docs/research/geo-baseline-2026-06.md` — the "before" marker all later runs compare against.

## 7. Build phasing (what waits on verification)

- **Phase 0 — this PR (no code):** this strategy doc + 50 drafted EN answers in `docs/faq-drafts/`, grounded and verification-flagged.
- **Phase 1 — after HGD fact sign-off:** build `faqs` collection + `/faq` route + `FAQPage` schema + `Organization` entity enrichment + `llms.txt`. Seed verified answers as Payload **drafts**; HGD publishes. (Standing rule: **do not auto-publish content to the DB.**)
- **Phase 2 — ongoing, mostly non-dev:** Wikipedia/Wikidata workstream; HR translations of the FAQ; monthly prompt-testing; the candidate 7th blog post once tour data arrives.

## 8. Open verification items

Facts the drafts need HGD to confirm before publishing (full per-question detail in `docs/faq-drafts/README.md`):

1. **King naming** — source treats Osman = White King (wears red), Moro = Black King (abductor), Otmanović = Moro's father; the source doc is internally ambiguous about which of Moro/Otmanović is "the Black King." Confirm the troupe's canonical usage. (Also blog README item 1.)
2. **Countries HGD has toured** (Q49) — source documents only Prague 1947 + "the international stage." Need the actual list.
3. **Exact cast size per performance** (Q29/Q50) — source gives ~80 society members across three sections, but not how many dancers/total cast appear in one public show.
4. **Narration language(s) for tourists today** (Q37) — source says archaic 17th-c Korčulan dialect; `marketing.md` notes multilingual narration. Confirm what languages the spoken intro is delivered/summarized in now.
5. **Whether children perform in public shows** (Q44) — source says boys learn from elementary school, but doesn't state that children appear in the ticketed performance.
6. **Injury history / safety framing** (Q47/Q48) — source says strikes are precise to avoid injury; TripAdvisor themes mention "occasional blood." Confirm how to honestly frame risk without overstating safety.
7. **Meet-and-greet / photos with dancers after the show** (Q41/Q42) — not in any source doc; confirm HGD's actual policy.
8. **Show runtime** (Q15) — drafts use "about one hour" (per `marketing.md` review themes); historic St. Theodore show ran up to two hours. Confirm current runtime.

## 9. What we are NOT doing (and why)

- **HR/DE/IT GEO** — locked out by cookie-based locale; only EN is crawlable. Re-evaluate if the locale architecture changes.
- **Paid GEO-monitoring SaaS** — manual monthly prompt-testing is enough at this scale.
- **Schema spam / fabricated FAQ** — trust and Google-penalty risk; every answer is sourced and human-reviewed.
- **Editing Wikipedia as the subject without COI disclosure** — against Wikipedia policy; routed through the §4.3 process.
- **BreadcrumbList / RSS** — low GEO value for a site this size; skip.

---

### Related
- `docs/marketing.md` — paid acquisition, GBP, TripAdvisor, reviews, classic SEO.
- `docs/sveta-cecilija.md` — primary history source (cited throughout the FAQ drafts).
- `docs/adr/0003-brand-layer.md` — "Moreška by HGD Sveta Cecilija" brand layer (used in Organization schema).
- `docs/blog-drafts/` — the 6 long-form posts (PR #305); this FAQ work shares their verification flags.
- `CONTEXT.md` "URL structure" — why SEO/GEO is EN-only.
