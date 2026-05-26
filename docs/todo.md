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

---

---

## 5. From Dragan + Tatjana meetings (2026-05-26)

### Refund policy

Decisions (from session):
- **Customer cancellation:** no refund.
- **HGD cancels show:** full refund to all buyers.
- **Venue moved (Ljetno → Zimsko):** not a refund trigger; case-by-case if buyer insists.

To do:
- [ ] Build `/refund-policy` page (mirror `LegalPage` structure used by Privacy + Cookie). Sections: customer cancellation, HGD cancellation, venue change, lost/stolen tickets, refund timing (Stripe 5–10 days), case-by-case contact.
- [ ] Update `refundLabel` in `src/messages/{en,hr}.json` to link the new page (currently plain text, no link).
- [ ] Add the public URL to Stripe Dashboard → Settings → "Refund policy URL" (reduces chargeback risk).

### Show-moved-to-Zimsko workflow

- [ ] Admin button in `/admin` → "Mark show as moved to Zimsko" → two-step modal: preview recipient list → confirm → bulk mail via Brevo informing buyers of venue change. Buyer replies to `info@` for case-by-case refund (handled via existing Payload refund flow).

### Agency reservations workflow

Tracked in **#86**. Blocked on agency phone calls — see "Personal tasks" below.

### Door recovery flow

Tracked in **#87**. Three deliverables: PDF download on confirmation page, tehnika order lookup by email/name (scoped to active show), "next show" view with 2h post-start grace.

---

## 6. Personal tasks (operational, not dev)

- [ ] Create Google Calendar with 2026 season shows. (Manual one-off; auto-sync from Shows collection is a separate ask if it ever becomes painful.)
- [ ] Update show schedule in `/admin` per Tatjana's latest email.
- [ ] Send Brane the photo numbers.
- [ ] Set up YouTube channel for HGD.
- [ ] Clean up project files — needs concrete scope before doing. Candidates:
  - `assets/images/new-images/*` (untracked: black-bula.jpg, bula-alone.jpg, experience.jpeg, mate.jpg, moreska-nobilo.{jpg,pdf}, ocevi-sinovi.JPG, sfida-wide.jpg, sword-clash.jpg, wave.jpg) — decide kept / moved to `public/` / deleted.
  - `docs/` strays: `change-text.md`, `help.md`, `modify-issue#4.md`, `modify.md 16-42-44-630.md` — none look like permanent docs; review and delete.
- [ ] Call agencies (Kaleta, Iliskovic, Rent a Đir, Hotel Korčula, Marko Polo, Liburna, Bon Repos) — questionnaire in #86 comments. Operational prerequisite for the agency build.

---

## 7. Pending decisions (no dev work until decided)

### Group discount — revisit "every 5th ticket free"

Currently shipped per CONTEXT.md (`floor(totalTickets / 5) × (hasAdult ? 20 : 10)`). Brief flagged this for review. Open questions before changing anything:
- Is the current rule actually losing meaningful revenue, or is it driving group size up enough to compensate? Check stats after first month of season before changing.
- Does the discount interact with agency commission (#86)? Default: does **not** stack.
- Alternative models to consider: flat group rate from 10+ tickets, school-trip rate, no discount.

### Croatian name for "Moreška Experience"

Current state: EN "Moreška Experience"; HR translation in `services.cards[1]` needs the canonical name. Candidates:
- "Doživi Morešku" (active framing)
- "Moreška izbliza"
- (other — Tereza / Taso input?)

Pick one, then update `src/messages/hr.json` + any meta titles.

### Tereza logo

Waiting on Tereza to deliver new logo asset. Once received: drop into `public/`, swap reference in `Nav`, `Footer`, `Hero`, OG meta.

### Marketing (Taso)

Out of scope for dev — paid campaigns are owned by a separate HGD member. Only dev-adjacent ask is verifying tag firing (#71 Consent Mode etc.) when assets land.
