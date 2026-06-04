# 301 redirect map — korcula-moreska.com → moreska.eu

Per-page SEO redirect map for the cutover (issues [#11](https://github.com/jivancevic/sveta-cecilija/issues/11) / [#258](https://github.com/jivancevic/sveta-cecilija/issues/258), baseline [#37](https://github.com/jivancevic/sveta-cecilija/issues/37)).

**Source of truth for the URL list:** `Pages.csv` in this folder — the GSC "Top pages" export (Last 12 months, pulled 2026-05-26). Every indexed legacy URL that earned an impression is mapped below; nothing else is indexed, so this is the complete set.

This **refines** #258. #258 ships a blanket `301 → https://moreska.eu/` for the whole marketing site, which is correct for go-live but throws away the topical ranking signal of the few pages that actually rank. This map keeps that signal by sending each meaningful legacy page to its content-equivalent on the new site, and falls back to the same blanket homepage 301 for everything else. Drop-in replacement for #258's `korcula-moreska.com` snippet — the ticket-subdomain snippet in #258 is unchanged.

## Why per-page instead of blanket-to-home

A blanket `→ /` is treated by Google as a soft-404-ish "irrelevant redirect" for pages whose content doesn't exist on the homepage; the ranking for that URL's queries tends to evaporate rather than transfer. A redirect to a topically-equivalent page transfers the signal. Only two legacy pages carry real organic value (`/` and `/services/moreska-sword-dance/` = 137 of 165 total clicks), so the map is short — but those two are worth getting right.

## Mapping

Ordered by clicks (GSC Last-12-months). "→ catch-all" means no explicit rule; the final blanket rule sends it to `https://moreska.eu/`.

| Legacy path | Clicks | Impr. | New URL | Rationale |
|---|--:|--:|---|---|
| `/` | 89 | 1738 | `https://moreska.eu/` | home → home |
| `/services/moreska-sword-dance/` | 48 | 2197 | `https://moreska.eu/sections/moreska` | Highest-impression page; the canonical "what is moreška" page. `/sections/moreska` is the content-equivalent. **Judgment call** — see note below. |
| `/contacts/` | 3 | 165 | `https://moreska.eu/#contact` | No standalone contact route; the homepage `#contact` section is the live enquiry form. |
| `/about-us/` | 2 | 263 | `https://moreska.eu/about` | about → about |
| `/our-performances/` | 2 | 97 | `https://moreska.eu/tickets` | "Performances" = the public schedule, which is `/tickets`. |
| `/services/wind-orchestra/` | 2 | 86 | `https://moreska.eu/sections/wind-orchestra` | section equivalent |
| `/services/klapa-sv-cecilija/` | 1 | 96 | `https://moreska.eu/sections/klapa` | section equivalent |
| `/shop/` | 1 | 9 | `https://moreska.eu/` (catch-all) | No shop on the new site. |
| `/our-services/` | 0 | 99 | `https://moreska.eu/` (catch-all) | No services index route; services live as the homepage `.svcs` section + `/sections/*`. Home is the closest landing. |
| `/gallery/` | 0 | 41 | `https://moreska.eu/` (catch-all) | No gallery route. |
| `/privacy-policy/` | 0 | 33 | `https://moreska.eu/privacy-policy` | exact match |
| `/blog/` | 0 | 17 | `https://moreska.eu/blog` | blog index → blog index |
| `/2023/05/30/moreska-national-day-celebration/` | 0 | 32 | `https://moreska.eu/blog` | Legacy post not migrated; send to blog index, not a 404. |
| `/2023/05/28/happy-national-day/` | 0 | 8 | `https://moreska.eu/blog` | same |
| `/product-tag/franko-oreb/` | 0 | 11 | catch-all | WooCommerce tag, no equivalent |
| `/tag/ensemble/` | 0 | 2 | catch-all | WP tag archive, no equivalent |
| `/product-tag/korculas-singing-society-st-cecily/` | 0 | 2 | catch-all | Woo tag (could justify `/sections/klapa`, but 0 clicks — not worth a rule) |
| `/product-tag/moreska/` | 0 | 1 | `https://moreska.eu/sections/moreska` | folds into the moreška section rule for free |
| `/product-category/books/` | 0 | 1 | catch-all | Woo category, no shop on new site |
| `/wp-content/uploads/2023/05/Logo.png` | 0 | 1 | catch-all | image asset; not worth a rule |
| `/wp-content/uploads/2023/05/DSC_1.25.61-scaled.jpg` | 0 | 1 | catch-all | image asset |

**Coverage note (no silent caps):** 14 of 21 legacy URLs get an explicit rule; the remaining 7 (all 0-click WooCommerce tags/categories and two image assets) intentionally fall through to the blanket homepage 301. They carry no ranking signal worth a dedicated rule.

### The one judgment call: `/services/moreska-sword-dance/`

This is the #2 page (2197 impressions) and it ranks ~7.7 for the money queries — "korcula sword dance tickets", "moreska sword dance korcula tickets". Two defensible targets:

- **`/sections/moreska`** (chosen) — content-equivalent, so the ranking signal transfers cleanly. Risk: it's an informational page, so ticket-intent visitors need one more click.
- **`/tickets`** — matches the *intent* of the ticket queries, better immediate conversion. Risk: content mismatch (a bare schedule vs. a descriptive page) can be read as a less-relevant redirect and bleed ranking.

Chosen `/sections/moreska` to protect the ranking. **Required follow-up to make this safe:** `/sections/moreska` must carry a prominent "Buy tickets" / `→ /tickets` CTA above the fold so the ticket-intent traffic still converts in one click. If that CTA can't be guaranteed, flip this single rule to `/tickets`.

## Drop-in `.htaccess` block (marketing site docroot)

Replaces the `korcula-moreska.com` snippet from #258. Paste at the top of the `korcula-moreska.com` docroot `.htaccess`, **above** `# BEGIN WordPress`. Per-page rules carry `[L]` and come first; the final rule is the same blanket fallback as #258. Leave the `tickets.korcula-moreska.com` snippet from #258 as-is.

```apache
# --- Cutover: per-page 301 map to moreska.eu (refines #258) ---
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{HTTP_HOST} ^(www\.)?korcula-moreska\.com$ [NC]

# Topical redirects (trailing slash optional)
RewriteRule ^services/moreska-sword-dance/?$   https://moreska.eu/sections/moreska [R=301,L]
RewriteRule ^product-tag/moreska/?$            https://moreska.eu/sections/moreska [R=301,L]
RewriteRule ^services/wind-orchestra/?$        https://moreska.eu/sections/wind-orchestra [R=301,L]
RewriteRule ^services/klapa-sv-cecilija/?$     https://moreska.eu/sections/klapa [R=301,L]
RewriteRule ^about-us/?$                       https://moreska.eu/about [R=301,L]
RewriteRule ^our-performances/?$              https://moreska.eu/tickets [R=301,L]
RewriteRule ^contacts/?$                       https://moreska.eu/#contact [R=301,L]
RewriteRule ^privacy-policy/?$                 https://moreska.eu/privacy-policy [R=301,L]
RewriteRule ^blog/?$                           https://moreska.eu/blog [R=301,L]
RewriteRule ^[0-9]{4}/[0-9]{2}/[0-9]{2}/.*$    https://moreska.eu/blog [R=301,L]

# Everything else → homepage (same blanket fallback as #258)
RewriteRule ^ https://moreska.eu/ [R=301,L]
</IfModule>
# --- end cutover redirect ---
```

Notes:
- The dated-post rule `^[0-9]{4}/[0-9]{2}/[0-9]{2}/.*$` catches both legacy news posts (and any other `/YYYY/MM/DD/...` permalinks) → `/blog`.
- `#contact` fragment: Apache forwards it; the browser scrolls to the homepage enquiry form.
- Keep these reversible — per #258, the `.htaccess` redirects are the primary rollback lever for the public sites. To roll back, delete the block.

## Verification (post-paste)

Run from a fresh device / `curl -I` (expect `301` + the mapped `Location`):

```bash
for p in / services/moreska-sword-dance/ contacts/ about-us/ our-performances/ \
         services/wind-orchestra/ services/klapa-sv-cecilija/ privacy-policy/ \
         blog/ 2023/05/30/moreska-national-day-celebration/ shop/ gallery/ ; do
  printf '%-48s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://korcula-moreska.com/$p"
done
```

Expected: each path returns `301` and the `Location` from the table above; unmapped paths (`shop/`, `gallery/`, …) return `301 https://moreska.eu/`.
