# Niche questions

Open questions where Josip needs to consult the current admin / check the old site before deciding. Each entry: the question, *why it matters*, and *what the answer unblocks*.

## Legacy site migration (korcula-moreska.com → moreska.eu)

### ~~What proof of purchase does a korcula-moreska.com buyer hold?~~ ✅ ANSWERED
Old site issues QR codes; door staff scans them with the **`checkinera`** app. Buyers have a QR.

### Can `checkinera` + the old site keep running in read-only "scan mode" through this season?
- **Why it matters:** Determines whether legacy QRs keep working as-is at the door (cheapest path), or whether we need to import/re-issue them on moreska.eu.
- **Specifically need to know:** (a) Will the old-site hosting + DB stay up after DNS cutover? (b) Does `checkinera` depend on the old site, or is it an independent SaaS? (c) Does old-site admin retain access to `checkinera` admin to disable new sales while keeping scanning?
- **Unblocks:** Dual-scanner vs. import-tokens vs. re-issue decision (Q5).

### Exact count of legacy tickets sold, broken down per show
- **Estimate:** ~100 tickets total across the season (Josip's rough guess).
- **Why it matters:** Per-show counts are needed to deduct from venue capacity on moreska.eu so we don't oversell. Total alone isn't enough.
- **Unblocks:** Whether we hand-enter a `legacyReserved` count per show in the admin, or import a structured CSV from the old site.

## Decisions captured (no admin input needed)

### Old-site sales freeze on cutover
On the day moreska.eu goes live, old-site checkout is disabled (or redirected to moreska.eu). The legacy buyer set is finite from that moment. No parallel selling — avoids reconciling capacity between two systems.

### Per-show `legacyReserved` field on Shows
Hand-entered integer per show, supplied by old-site operator. Subtracted from venue capacity in `getUpcomingShows`. Prevents oversell against seats already promised on the old site.

### Dual-scanner at the door this season
`checkinera` keeps scanning legacy QRs; moreska.eu `/scan/[token]` scans new QRs. Door staff handles both. No data import, no re-issue. `checkinera` decommissioned after the 2026 season ends.

### Buyer comms: banner only, no proactive email
On cutover, the old-site redirect page (or banner on the old domain) carries a one-line message: "Your ticket is valid — show your QR at the door as planned. Booking new tickets has moved to moreska.eu." No mass email to legacy buyers — avoids needing a buyer-data export from the old operator and spam-folder risk.

### Old WordPress site stays read-only through 2026 season
On cutover day, old-site dev disables checkout, replaces homepage with banner (HR + EN), keeps everything else reachable so `checkinera` and QR-scan back-ends stay functional. After season ends (~Oct 2026): 301-redirect domain to moreska.eu, then let domain expire. Coordination items tracked in `docs/todo.md` §0.

### Show alignment
The 2026 schedule already exists in moreska.eu's `Shows` collection — same dates/times/venues as the old site. No seeding work needed. Admin sets `legacyReserved` on existing rows once the per-show counts arrive from the old-site operator.

### Legacy refunds: manual via Stripe dashboard
Legacy ticket refund requests go to `info@moreska.eu` (or whatever the old-site contact was). Whoever has Stripe dashboard access processes them directly (charges visible in the same Stripe account that moreska.eu now uses). Admin manually decrements that show's `legacyReserved` by the refunded ticket count. Not exposed in the moreska.eu admin refund UI — that UI only handles refunds tied to our own Order rows.
