# Non-Development TODOs

These must be completed alongside development — all have waiting periods (verification delays, DNS propagation). Start them immediately, not after the code is ready.

---

## 0. Coordinate with old-site WordPress dev (korcula-moreska.com)

Old WordPress site stays up read-only through end of 2026 season so `checkinera` keeps scanning legacy QRs. Ask the dev who built `korcula-moreska.com` to, on cutover day:

1. **Disable all new ticket purchases** (remove/short-circuit checkout, hide "Buy tickets" CTAs). Keep the rest of the site reachable so `checkinera` and any QR-scan back-ends stay functional.
2. **Replace homepage hero (or add a top-of-page banner) with a notice — in both HR and EN:**
   - HR: *"Prodaja ulaznica preselila se na **moreska.eu**. Vaša postojeća ulaznica i dalje vrijedi — pokažite QR kod na ulazu kao i obično."*
   - EN: *"Ticket sales have moved to **moreska.eu**. Your existing ticket is still valid — show your QR code at the door as usual."*
3. **Confirm `checkinera` is independent** of the WordPress site's checkout — i.e. disabling checkout does not break door scanning. If `checkinera` reads from the WP database, document which tables must stay populated.
4. **After 2026 season ends** (~end of October): 301-redirect whole domain to `moreska.eu`, then let domain expire at next renewal.

Also ask them for: per-show count of legacy tickets sold (to populate `legacyReserved`).

---

## 1. Stripe — Migrate from korcula-moreska.com to moreska.eu

There is an existing active Stripe account tied to **korcula-moreska.com**. No new account or verification is needed — the same account and keys will be used for `moreska.eu`. The migration involves updating the webhook endpoint and branding only.

**~~Step 1 — Retrieve existing keys:~~** ✓ Done

**~~Step 2 — Add a second webhook endpoint for moreska.eu:~~** ✓ Done

**Step 3 — Update Stripe branding (after go-live):**
- [ ] In Stripe → **Settings → Business details** → update public business URL to `moreska.eu`
- [ ] In Stripe → **Settings → Branding** → update any references to the old domain

**Step 4 — Remove old webhook (after DNS cutover is confirmed stable):**
- [ ] In Stripe → **Developers → Webhooks** → disable and delete the `korcula-moreska.com` endpoint

> Keys are domain-agnostic — the same publishable and secret keys work on both domains simultaneously, which is why running both webhooks in parallel during migration is safe.

---

## 2. Brevo — Verify Domain & Configure Sender

> **Why Brevo:** Free tier includes unlimited custom domains, 300 emails/day, 9,000/month — more than enough for ticket confirmation emails at this scale.

- ~~Go to brevo.com and create a free account~~ ✓
- ~~Add domain `moreska.eu` and get DNS records~~ ✓
- ~~Add SPF, DKIM, DMARC records to Hetzner DNS~~ ✓ (done in 4e)
- ~~Wait for domain verification~~ ✓
- ~~Add sender `info@moreska.eu`~~ ✓
- ~~Retrieve API Key and add as `BREVO_API_KEY` in Coolify~~ ✓

---

## 3. ~~info@moreska.eu — Set Up Email Receiving via ImprovMX~~ ✓ Done

---

## 4. Infrastructure — Step-by-Step Guide

> **Why Hetzner:** Equivalent specs (4 GB RAM / 2 vCPU) cost ~€4.35/month (CX22) vs. DigitalOcean's $18/month. Frankfurt datacenter is equally close to Croatia.

### 4a. ~~Create Hetzner Server~~ ✓ Done

**Decommission the DigitalOcean Droplet:**
- [ ] Site is confirmed live at `https://moreska.eu` ✓ — destroy the DO Droplet to stop billing

### ~~4b. Install Coolify on Hetzner~~ ✓ Done

### ~~4c. Connect GitHub Repository to Coolify~~ ✓ Done

- ~~Steps 1–8, 10: GitHub connected, project created, Nixpacks, port set~~ ✓
- ~~Step 9 — Fill in environment variables in Coolify:~~
  - ~~`DATABASE_URL`~~ ✓
  - ~~`PAYLOAD_SECRET`~~ ✓
  - ~~`STRIPE_SECRET_KEY`~~ ✓
  - ~~`STRIPE_WEBHOOK_SECRET`~~ ✓
  - ~~`STRIPE_PUBLISHABLE_KEY`~~ ✓
  - ~~`BREVO_API_KEY`~~ ✓
  - ~~`NEXT_PUBLIC_BASE_URL`~~ ✓

### ~~4d. Configure DNS and SSL for moreska.eu~~ ✓ Done

### ~~4e. Brevo DNS Records~~ ✓ Done

---

## Order of Operations

**1 (Stripe):** Steps 1–2 done ✓. Steps 3–4 are post-go-live cleanup.  
**2 (Brevo):** ✓ Done — domain verified, sender added, API key in Coolify.  
**4a (DO Droplet):** Site confirmed live ✓ — destroy the DO Droplet now to stop billing.  
**4c (env vars):** ✓ All set.  
**4e (Brevo DNS):** ✓ Done.  

All of these can be completed while development is in progress.
