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

## GA4 — owner hunt abandoned, history accepted as lost

GA4 property `G-MK1PTE1GKR` is live on `korcula-moreska.com` (confirmed 2026-05-26: `/g/collect` returns 204, so Google's backend still accepts the measurement ID). MonsterInsights (Lite) installed it; OAuth tokens are stored in WP, but the Google account that authorized the OAuth is not.

Every HGD-controlled email surface was tested as a Google account by 2026-05-26 — all ruled out:

- `sv.cecilija@korcula-moreska.com` — not a Google account
- `klapa@korcula-moreska.com` — not a Google account
- `glazba@korcula-moreska.com` — not a Google account
- `moreska.cecilija@gmail.com` — Google account, no GA properties attached
- `sv.cecilija@hi.t-com.hr` — Google account, no GA properties attached
- Previous webmaster `info.nero3d@gmail.com` — confirmed `korcula-moreska.com` is not visible in his GA property list

Also searched the `sv.cecilija@hi.t-com.hr` inbox for old `noreply-analytics@google.com` / `search-console-noreply@google.com` mails that might leak the owner address — none found.

**Decision (2026-05-26): accept GA4 history loss.** Fresh GA4 property to be created on `moreska.eu` from day one of cutover (tracked in follow-up issue). Pages/queries from the GSC export above are sufficient for the #11 redirect map; historical traffic comparison was a nice-to-have, not load-bearing.

## GSC ownership

A second Owner was added to the existing GSC property on 2026-05-25 by uploading an HTML verification file to the WordPress site root via cPanel. This grants the HGD-controlled Google account full access to historical Performance / Links data — which is what made these exports possible without finding the original owner. The original Owner (whoever uploaded `google4f024cc0cf950dd5.html`) is still on the property; no action taken to remove them.
