# Blog drafts, first 6 long-form posts

> **Status: DRAFTS for human editorial review. Do NOT publish to the database as-is.**
> These map to the `posts` collection (`src/collections/Posts.ts`) but are deliberately
> kept as Markdown files so an HGD editor can review, correct, and approve them first.

Drafted per GitHub issue **#47** and `docs/marketing.md` §7 (Content / blog). Targets
informational queries that paid search can't profitably bid on, the payoff is **2027
organic** traffic post-DNS-cutover (`korcula-moreska.com` → `moreska.eu`).

## SEO & voice ground rules applied

- **English is primary.** Per `docs/marketing.md`, SEO scope is EN-only, the cookie-based
  locale architecture (`src/proxy.ts`) means HR/DE URLs aren't separately indexable, so HR
  posts earn no organic lift. HR drafts are provided only where the audience is genuinely
  local/diaspora and the post is social-shareable (posts **2** and **6**). See per-post notes.
- **Internal links never carry a `/en` or `/hr` prefix** (hard rule, `src/proxy.ts`), all
  internal links point at bare paths: `/tickets`, `/about`, `/sections/moreska`, etc.
- Brand voice matches `docs/copywriting.md`: reverent, concrete, sensory, never breathless.
  Brand layer = *"Moreška by HGD Sveta Cecilija, the Original Moreška, performed since 1883"*
  (`docs/adr/0003-brand-layer.md`).
- Each post: SEO title + meta description (~155 chars, → `excerpt`), one target keyword,
  H2/H3 structure, 800–1,500 words, ≥2 internal links to commercial pages, a hero image
  already present in `public/`, and a **Sources** footer citing `docs/sveta-cecilija.md`
  line numbers. `BlogPosting` JSON-LD is emitted automatically by the blog infra (#41).
- **No invented facts.** Every historical claim is traceable to `docs/sveta-cecilija.md`.
  Anything I could not source there is collected under **⚠️ Needs verification** at the
  bottom of this file and flagged inline in the relevant draft.

## The 6 topics

| # | File | Working title | Target keyword | Hero | HR? |
|---|------|---------------|----------------|------|-----|
| 1 | `01-what-to-expect.md` | What to Expect at a Moreška Performance in Korčula | `moreska performance korcula` | `/moreska-wide.webp` |, |
| 2 | `02-history-of-moreska.md` | The History of Moreška: 400 Years of Sword Dance | `history of moreska` | `/cecilija-est.webp` | ✅ `02-history-of-moreska.hr.md` |
| 3 | `03-moreska-with-kids.md` | Is Moreška Suitable for Kids? A Parent's Guide | `moreska with kids` | `/younglings.webp` |, |
| 4 | `04-moreska-vs-kumpanjija.md` | Moreška vs Kumpanjija: Korčula's Two Sword Dances | `moreska vs kumpanjija` | `/todor-2-vojske.webp` |, |
| 5 | `05-korcula-in-the-evening.md` | What to Do in Korčula in the Evening | `things to do in korcula at night` | `/torches.webp` |, |
| 6 | `06-meet-the-dancers.md` | Behind the Scenes: Meet the Moreška Dancers | `moreska dancers` | `/moreskanti-cool.webp` | ✅ `06-meet-the-dancers.hr.md` |

## Suggested publishing cadence (1/month)

Front-load the high-intent practical posts for the back half of the 2026 season, then run
the durable/heritage pieces into the off-season so they age before the 2027 harvest.

| Month | Post |
|---|---|
| Jul 2026 | 1, What to Expect (highest commercial intent, peak season) |
| Aug 2026 | 3, Is Moreška Suitable for Kids? (family travel peak) |
| Sep 2026 | 5, What to Do in Korčula in the Evening |
| Oct 2026 | 4, Moreška vs Kumpanjija |
| Nov 2026 | 2, The History of Moreška (evergreen heritage anchor) |
| Dec 2026 | 6, Behind the Scenes: Meet the Dancers |

(Adjust freely per HGD priorities, this is the suggested order from #47, lightly re-sequenced
so the two highest-intent posts publish during peak booking weeks.)

## How to publish a draft (when approved)

For each approved draft, create a `posts` row with: `title`, `slug`, `locale`, `excerpt`
(the meta description), `heroImage` (the `/public` path), `heroImageAlt`, `body` (the prose,
converted to rich text), `publishedAt`, `status: published`. The frontmatter block at the top
of each draft already carries these values.

## Needs verification (before publishing)

Verification status, HGD member answered the fact questions **2026-07**. Resolved items
marked ✅; the rest still need an HGD/editor pass.

1. ✅ **King naming, CONFIRMED.** Osman = White King (wears red), Moro = Black King /
   abductor (wears black), Otmanović = Moro's father (not a king). White (red) army wins.
   Applied across all posts; removed the inline king-naming flags.
2. **Kumpanjija specifics (post 4).** `docs/sveta-cecilija.md` (line 193) only establishes that
   Kumpanjija and Moštra are *other* Korčula-island sword dances from Žrnovo, Blato and Vela Luka,
   performed at the 1997 Sword Dance Festival. Any claim in post 4 about *how* Kumpanjija differs
   (linked/chain swords, recruitment-of-soldiers theme, which villages) is **general knowledge, not
   sourced from our doc**, flagged inline. Verify against an HGD/ethnology source before publishing.
3. **"What to do in the evening" specifics (post 5).** Town landmarks (Marco Polo association, the
   cathedral, the waterfront) are widely-cited local lore but not in our source doc. No specific
   third-party business is named on purpose. HGD should confirm/curate any named attractions.
4. **Dancer profiles (post 6).** I did **not** invent any living dancer's name, quote, age, or
   family story. The post is a sourced portrait of the *tradition* with clearly-marked
   `[[PLACEHOLDER]]` slots where HGD should drop in real dancer interviews, names and photos
   before publishing. Named historical figures (Lozica, Odak, Svoboda, Jeričević) are from the
   source doc.
5. ✅ **Runtime, CONFIRMED ~1 hour (~60 min)** for the whole evening (incl. the other
   sections), per HGD (2026-07). Historical St. Theodore presentation up to two hours; dance
   portion up to ~30 min.
7. ✅ **Training time, CONFIRMED ~10 months to 1.5 years** to become stage-ready (HGD
   2026-07). Corrected the "years of training / since childhood" phrasing in post 6 (EN + HR).
8. **Tour countries (post-6 candidate / "Moreška around the world").** Verified list still
   pending → tracked in **issue #340**; only Prague 1947 is confirmed.
6. **Hero image alt text & licensing.** All heroes reference webp files already in `public/`.
   Confirm each chosen photo is HGD-owned/cleared for web use (issue #47 acceptance criterion:
   "no generic stock") and tune the alt text.
