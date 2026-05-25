# ADR-0004: Email infrastructure — addresses, sender identities, provider plan

**Status:** Accepted
**Date:** 2026-05-25

## Context

The org needs a public email layout before cutover from `korcula-moreska.com` to `moreska.eu`. Several distinct concerns are bundled:

1. **Human inbox access.** Two real readers exist (Josip — developer + member; secretary — also treasurer, and proxy for the president). A separate person manages social media. Section leaders, door staff, and the president do not read mail directly.
2. **Outgoing transactional mail.** Stripe-triggered ticket confirmations (QR codes) go out via Brevo from a sender identity that buyers visibly see in their inbox.
3. **Social platform account hygiene.** Instagram / Facebook / TikTok / YouTube need a login + recovery email. If that email is a volunteer's personal address, the org loses the accounts when they leave.
4. **Future bulk post-show email.** Roughly 30–80 online buyers per show could receive a follow-up ("thanks for coming, leave a review"). Volume per send is small but the send is marketing-class, with deliverability implications for transactional ticket mail on the same domain.
5. **Provider choice at scale.** Brevo free tier is 300/day, 9000/month. The daily cap (not monthly) is the binding constraint once post-show bulk sends ship.

Door-staff currently authenticate to `/admin` via a shared Payload User with email `door-staff@moreska.eu`. The address is a login string only; nothing is sent to it.

## Decision

### Real readable mailboxes (1)

- **`info@moreska.eu`** — the only mailbox humans read. Josip and the secretary both have access. Catch-all for the org. Replies to ticket buyers, contact-form follow-ups, tour-operator coordination, and press all land here.

### Forward-only aliases (→ `info@moreska.eu`)

- **`tickets@moreska.eu`** — `From:` header on Brevo-sent ticket confirmations. `Reply-To: info@moreska.eu` so buyer replies land in the real inbox. Forwarding catches the rare case where a buyer hits "reply" on a mail client that ignores Reply-To, or replies-all to a forwarded copy.
- **`pr@moreska.eu`** — login/recovery address for Instagram / Facebook / TikTok / YouTube and any future social platforms. The social manager does **not** log into this mailbox; they log into the platforms. Notifications and platform admin mail forward to `info@`.
- **`bookings@moreska.eu`** — published address for tour operators and group/charter inquiries. Lets us filter/route group requests separately later if a real volume need surfaces.
- **`press@moreska.eu`** — published on the site for journalists. Forwards to `info@`. Zero ongoing cost; signals professionalism.

### Renamed (operational)

- **`door-staff@moreska.eu` → `tehnika@moreska.eu`** in production for the shared Payload User login. Login-string-only; no inbox. Local `_dev` keeps the old name (or any name) — only prod needs renaming.

### Sending infrastructure

- **Transactional sender:** Brevo, sending domain = `moreska.eu`. `From: tickets@moreska.eu`, `Reply-To: info@moreska.eu`.
- **Marketing sender (future):** Brevo, sending domain = **`bilten.moreska.eu`** (Croatian for "bulletin/newsletter"). Separate DKIM, distinct reputation. Activated when bulk post-show email ships.
- **Plan:** stay on Brevo free tier until bulk post-show email ships, then upgrade to **Brevo Starter (~€9/mo, 5k/mo, no daily cap)**. Same SDK, same DNS — zero migration cost.

### Forwarding mechanics

ImprovMX already handles `info@moreska.eu` → personal inbox via MX records on `moreska.eu`. All new aliases (`tickets@`, `pr@`, `bookings@`, `press@`) are added as ImprovMX forwards to `info@`. No new mailboxes to provision; ImprovMX aliases are free at this scale.

## Alternatives considered

1. **One identity (`info@` for everything, including transactional `From:`).** Simpler, but: (a) every Instagram/Facebook notification pollutes the human-read inbox, (b) handing socials to a future agency would require migrating Instagram off `info@` instead of changing one ImprovMX forward, (c) no audit signal from the `From:` line distinguishing automated vs. human-authored mail.
2. **Personal volunteer email for social platform logins.** Lowest setup cost. Rejected because the org loses the social accounts when the volunteer leaves — high-impact, low-probability-per-year but inevitable on a multi-year horizon.
3. **Resend / Postmark / AWS SES instead of Brevo.** Better DX (Resend) or cheaper per-email (SES), but at this volume the integration and DNS cost outweighs the savings. Brevo already works, has the marketing UI we'll want for post-show sends, and €9/mo is not a number worth optimising.
4. **Send marketing from root `moreska.eu`.** A handful of spam complaints on a "leave us a review" post-show blast would damage the same sending reputation that delivers ticket QR codes — and a missing QR code is a serious customer-experience failure. Subdomain separation prevents this cross-contamination.
5. **`news.moreska.eu` instead of `bilten.moreska.eu`.** Generic and English-default. `bilten` is the literal Croatian word for what the subdomain sends; appears unambiguously in click-tracking link rewrites; consistent with the org's Croatian identity.

## Consequences

- **Pro:** One inbox to monitor. Two readers see everything. No mailbox proliferation.
- **Pro:** Social platforms anchor to an org-controlled address; volunteer turnover doesn't risk account loss.
- **Pro:** Marketing-class mail on a separate subdomain protects ticket-delivery reputation.
- **Pro:** Provider upgrade is a billing flip, not a migration.
- **Con:** Five aliases to keep in sync in ImprovMX. Documented above; low cognitive cost.
- **Con:** `bilten.moreska.eu` requires DNS records (SPF, DKIM, DMARC, MX-or-CNAME per Brevo) before the first send. One-off setup task tracked separately.

## Related

- `CLAUDE.md` — "Email sending" section describes the current Brevo / ImprovMX integration on `moreska.eu`
- ADR-0003 — brand layer (the marketing surface that bulk post-show email amplifies)
- Issues: alias provisioning, Brevo Starter upgrade, `tehnika@` rename, bulk post-show email feature
