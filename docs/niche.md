# Niche questions

Open questions where Josip needs to consult the current admin / check the old site before deciding. Each entry: the question, *why it matters*, and *what the answer unblocks*.

## Legacy site migration (korcula-moreska.com → moreska.eu)

### ~~What proof of purchase does a korcula-moreska.com buyer hold?~~ ✅ ANSWERED
Old site issues QR codes; door staff scans them with the **`checkinera`** app. Buyers have a QR.

### ~~Can `checkinera` + the old site keep running in read-only "scan mode" through this season?~~ ✅ ANSWERED — moot
Investigated 2026-06-04 via authenticated wp-admin. The legacy stack is **WordPress + Tickera + WooCommerce** at `tickets.korcula-moreska.com`; `checkinera` is Tickera's check-in app, authenticated by the API key under Tickera Settings → API Access (there is also a built-in browser scanner, Tickera "Barcode Reader"). So `checkinera` *could* keep scanning if the WP site stays up. **But the question is now moot:** only ~9 legacy tickets are for future shows, so the decision is to admit them MANUALLY at the door (see revised decisions below). No dual-scanner, no import, no re-issue.

### ~~Exact count of legacy tickets sold, broken down per show~~ ✅ ANSWERED
Pulled live 2026-06-04 from Tickera's **Attendees & Tickets** list (`post_type=tc_tickets_instances`, dynamically re-pullable): **146 paid tickets total, but only 9 are for FUTURE shows** — 7 on 2026-06-08 and 2 on 2026-06-22 (the other 137 are the already-past 18.05 = 75 and 25.05 = 62). Almost all adults (143 adult, 3 child). Per-show counts feed `legacyReserved`; re-pull at the freeze moment. Counts are hand-entered, no CSV import needed at this volume.

## Decisions captured (no admin input needed)

### Old-site sales freeze on cutover
On the day moreska.eu goes live, old-site checkout is disabled (or redirected to moreska.eu). The legacy buyer set is finite from that moment. No parallel selling — avoids reconciling capacity between two systems.

### Per-show `legacyReserved` field on Shows
Hand-entered integer per show, supplied by old-site operator. Subtracted from venue capacity in `getUpcomingShows`. Prevents oversell against seats already promised on the old site.

### ~~Dual-scanner at the door this season~~ SUPERSEDED 2026-06-04 → manual admit
With only ~9 future legacy tickets, no scanner is needed for them. Door staff admit those 9 from an exported name+code list (the values are also entered as `legacyReserved`, so capacity is protected). moreska.eu `/scan/[token]` scans new QRs as normal. No `checkinera`, no Tickera Barcode Reader, no data import or re-issue.

### ~~Buyer comms: banner only~~ SUPERSEDED 2026-06-04 → straight 301 redirect, no banner
No banner. Both old domains 301-redirect to moreska.eu (`korcula-moreska.com` → `/`, `tickets.korcula-moreska.com` → `/tickets`). A redirect beats a banner: it consolidates SEO link equity and sends anyone with an old bookmark to the live site. The 9 future legacy holders already have their QR PDFs and are admitted manually, so they need no on-site notice. No mass email.

### ~~Old WordPress site stays read-only through 2026 season~~ SUPERSEDED 2026-06-04 → redirect both old domains now
The Tickera scanner does not need to stay alive (manual admit), so the ticket subdomain is redirected too — and the redirect itself is the sales freeze (storefront becomes unreachable). The redirect on `tickets.korcula-moreska.com` keeps `/wp-admin` reachable as back-office insurance for legacy lookups. No old-site dev coordination required; Josip has cPanel + wp-admin access. Cutover broken into sub-issues #256–#261 under #11.

### Show alignment
The 2026 schedule already exists in moreska.eu's `Shows` collection — same dates/times/venues as the old site. No seeding work needed. Admin sets `legacyReserved` on existing rows once the per-show counts arrive from the old-site operator.

### Legacy refunds: manual via Stripe dashboard
Legacy ticket refund requests go to `info@moreska.eu` (or whatever the old-site contact was). Whoever has Stripe dashboard access processes them directly (charges visible in the same Stripe account that moreska.eu now uses). Admin manually decrements that show's `legacyReserved` by the refunded ticket count. Not exposed in the moreska.eu admin refund UI — that UI only handles refunds tied to our own Order rows.
