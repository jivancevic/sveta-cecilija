# Legacy SEO baseline — korcula-moreska.com

Captures what the old WordPress site at `korcula-moreska.com` was earning organically before the cutover to `moreska.eu` (target: end of June 2026). Used post-season to build the 301 redirect map (issue #11) so the migration preserves indexed pages and ranking signals.

Tracking issue: [#37](https://github.com/jivancevic/sveta-cecilija/issues/37).

## Exports (2026-05-26)

Pulled from Google Search Console, date range Last 12 months.

| File | Source | Notes |
|---|---|---|
| `Queries.csv` | GSC → Performance → Queries | Top queries by clicks |
| `Pages.csv` | GSC → Performance → Pages | Top landing pages by clicks — primary input for the 301 map |
| `Countries.csv` | GSC → Performance → Countries | |
| `Devices.csv` | GSC → Performance → Devices | |
| `Filters.csv` | GSC → Performance (filter state metadata) | |
| `Chart.csv` | GSC → Performance | Daily clicks/impressions over the period |
| `Search appearance.csv` | GSC → Performance → Search appearance | |
| `https___korcula-moreska.com_-Top linking sites-2026-05-26.csv` | GSC → Links → Top linking sites | Backlink baseline |

## GA4 — owner unknown, history at risk

GA4 property `G-MK1PTE1GKR` is live on `korcula-moreska.com` (confirmed via gtag in page source, and via `monsterinsights_site_profile` in the WP database). MonsterInsights (Lite) is the installer, OAuth tokens are stored in WP, but the Google account that authorized the OAuth is not.

Owner-search ruled out as of 2026-05-26:

- All three WP administrators (`sv.cecilija@`, `klapa@`, `glazba@` on `korcula-moreska.com`) — none are registered Google accounts, so none can be the GA4 OAuth identity.
- Previous webmaster `info.nero3d@gmail.com` does not recall setting up GA; asked to check whether `G-MK1PTE1GKR` appears in his `analytics.google.com` property list. **Awaiting reply.**

Decision deadline: **2026-06-15**. If GA4 access is not recovered by then, accept the history loss, set up a fresh GA4 property on `moreska.eu` from day one, and close #37 with the GSC-only baseline above.

## GSC ownership

A second Owner was added to the existing GSC property on 2026-05-25 by uploading an HTML verification file to the WordPress site root via cPanel. This grants the HGD-controlled Google account full access to historical Performance / Links data — which is what made these exports possible without finding the original owner. The original Owner (whoever uploaded `google4f024cc0cf950dd5.html`) is still on the property; no action taken to remove them.
