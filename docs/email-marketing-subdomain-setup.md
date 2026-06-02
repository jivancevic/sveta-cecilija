# Marketing email subdomain + Brevo plan — execution package

Human-action runbook for the marketing-email infrastructure decided in
[ADR-0004](./adr/0004-email-infrastructure.md). The bulk post-show review email
feature is already built in code (sends T+2h, one-click unsubscribe — #57); the
steps below are the DNS / dashboard / billing clicks an agent cannot perform.

Covers:

- **#56** — set up `bilten.moreska.eu` as a marketing sending subdomain (DNS + Brevo).
- **#54** — upgrade Brevo to the Starter plan when bulk sends ship.
- **Follow-ups** surfaced while building #57 / #94 (sender-domain flip, Stripe refund-policy URL).

Do these in order: **#56 first** (the sender domain must be verified before any
marketing mail goes out), **#54 second** (only when you're about to actually send
at volume), then the code flip.

---

## 1. #56 — `bilten.moreska.eu` sending subdomain

### Why a subdomain

Marketing-class mail (the "leave us a review" post-show blast) sends from a
separate subdomain so a handful of spam complaints can't damage the sending
reputation that delivers ticket-QR confirmations on root `moreska.eu`. See
ADR-0004 §"Sending infrastructure".

### Step 1 — add the domain in Brevo

1. Brevo dashboard → **Senders, Domains & Dedicated IPs** → **Domains** tab → **Add a domain**.
2. Enter `bilten.moreska.eu`.
3. Brevo shows a set of DNS records to add. **The exact DKIM target hostnames and
   the Brevo-code value are generated per account — copy them from this screen.**
   Newer Brevo accounts show DKIM as `mail._domainkey` / `mail2._domainkey`
   CNAMEs; older accounts show `brevo1._domainkey` / `brevo2._domainkey`. Use
   whatever the dashboard displays; the table below is the shape, not the literal
   values.

### Step 2 — add the records in Hetzner DNS

Hetzner DNS console (`dns.hetzner.com`) → zone `moreska.eu` → **Add record**. In
Hetzner the record **Name** is relative to the zone, so the `bilten` part is the
subdomain. Fill the values from Brevo's screen:

| Purpose | Type | Name (Hetzner, relative to `moreska.eu`) | Value |
|---|---|---|---|
| Brevo verification code | `TXT` | `bilten` | `brevo-code:XXXXXXXXXXXX` (from Brevo) |
| DKIM key 1 | `CNAME` | `mail._domainkey.bilten` *(or `brevo1._domainkey.bilten`)* | `<target shown by Brevo>` |
| DKIM key 2 | `CNAME` | `mail2._domainkey.bilten` *(or `brevo2._domainkey.bilten`)* | `<target shown by Brevo>` |
| SPF (alignment) | `TXT` | `bilten` | `v=spf1 include:spf.brevo.com -all` |
| DMARC | `TXT` | `_dmarc.bilten` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
| Click-tracking *(optional)* | `CNAME` | `<host shown by Brevo, e.g. sbtrk.bilten>` | `<target shown by Brevo>` |

Notes:

- The Brevo-code `TXT` and the SPF `TXT` both sit on host `bilten` — that's fine,
  a host can hold multiple TXT records. The **one** rule you must not break: only
  a single `v=spf1 …` TXT per host. `bilten` is a brand-new subdomain, so this is
  the only SPF record there.
- SPF is not strictly required for shared-IP sending (Brevo authenticates via the
  Brevo-code + DKIM), but adding the aligned SPF record above improves DMARC
  alignment and deliverability. Include it.
- DMARC `p=none` is the safe starting policy (monitor only). Tighten to
  `p=quarantine` later once `rua` reports show clean alignment for a few weeks.
- Click-tracking CNAME only appears if you enable click-tracking in Brevo. Add it
  if you want trackable links in the marketing mail.

### Step 3 — verify in Brevo

1. Wait for DNS propagation (Hetzner is usually minutes; allow up to a few hours).
2. Back on the Brevo domain page, click **Authenticate this email domain**.
3. Every record should flip to a green "Value matched" check. If DKIM stays red,
   re-check the CNAME target has no trailing-dot / zone-suffix duplication
   (Hetzner sometimes appends the zone — the stored value must resolve to exactly
   Brevo's target).

### Step 4 — create the marketing sender

1. Brevo → **Senders** → **Add a sender**.
2. Use an address on the authenticated domain so the From aligns with DKIM:
   **`newsletter@bilten.moreska.eu`** (recommended). A `@moreska.eu` From would
   send under the root domain's reputation, defeating the point of the subdomain.
3. Set the sender display name to **`Moreška by HGD Sveta Cecilija`** (brand layer, ADR-0003).
4. Make sure `newsletter@bilten.moreska.eu` (or whatever you pick) forwards to
   `info@moreska.eu` so any human replies land in the real inbox — add it as an
   ImprovMX/Workspace forward like the other aliases.

### Step 5 — test send

1. Send a Brevo test campaign / transactional test from the new sender to a Gmail
   and an Apple Mail address you control.
2. In Gmail: **Show original** → confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`,
   and that the signing domain is `bilten.moreska.eu`.
3. Send a normal ticket-confirmation on root `moreska.eu` in parallel and confirm
   it still authenticates unchanged (the subdomain work must not touch root).

### Acceptance (from #56)

- Brevo dashboard shows `bilten.moreska.eu` fully verified (all green).
- Test email from bilten passes SPF + DKIM + DMARC in Gmail/Apple Mail headers.
- Transactional ticket mail on root `moreska.eu` continues to send unchanged.

---

## 2. #54 — Brevo Starter upgrade

**Do this only when the bulk post-show send is about to go live at volume**, not
before — it's pure cost with no benefit until then (ADR-0004; issue #54).

### Why

Free tier = 300 emails/**day**, 9k/month. The **daily** cap is the binding
constraint: a post-show batch of 250–300 review emails plus the same day's ticket
confirmations would breach 300/day. Starter (~€9/mo) = 5k/month with **no daily
cap**. Same SDK, same DNS — a billing flip, not a migration.

### Steps

1. Brevo dashboard → upgrade to the **Starter** plan (confirm current price/quota
   at checkout — plan names/prices drift).
2. Pay on the **org card** (see `docs/org-banking-fintech` notes — the udruga's
   card / PayPal).
3. Make sure the Brevo billing receipt routes to **`info@moreska.eu`** (Brevo
   account email is `dev@moreska.eu` per ADR-0004, which forwards to info@).

### Acceptance

- Brevo plan shows Starter, 5k/month, no daily cap.
- A live post-show batch + same-day ticket mail no longer risks the 300/day wall.

---

## 3. Code flip after #56 verifies (gated, one-liner)

The review email (#57) currently sends `From: info@moreska.eu` because the bilten
subdomain isn't authenticated yet — sending from an unverified domain would tank
deliverability. **Once #56 is green:**

- In `src/lib/email/send-review-email.ts`, change `SENDER` from
  `{ email: 'info@moreska.eu', … }` to
  `{ email: 'newsletter@bilten.moreska.eu', name: 'Moreška by HGD Sveta Cecilija' }`.
- Do the same for `src/lib/email/send-venue-change-email.ts` if you want the
  bad-weather venue notice (#94) to ride the marketing subdomain too. (Arguably it
  is transactional — it's about a ticket the buyer already holds — so leaving it on
  root `moreska.eu` is also defensible. Decide per deliverability preference.)
- Leave ticket confirmations and refund emails on root `moreska.eu` — those are
  transactional and must keep the root reputation.

This is the only code change; the unsubscribe link, List-Unsubscribe headers, and
T+2h timing already ship.

---

## 4. Stripe refund-policy URL (follow-up from #94)

The `/refund-policy` page now exists (#94). Add its URL to Stripe so it appears in
disputes and reduces chargeback loss rate:

- Stripe Dashboard → **Settings** → **Business / Public details** (or the
  "Refund policy URL" field) → set to **`https://moreska.eu/refund-policy`**.

---

## Cross-references

- [ADR-0004 — Email infrastructure](./adr/0004-email-infrastructure.md)
- [ADR-0010 — Google Workspace org email](./adr/0010-google-workspace-org-email.md) (the inbox side; this doc is the sending side)
- `docs/marketing.md` §"Reviews" — the post-show review email this infra powers
- Issues: #56 (this DNS/Brevo setup), #54 (Starter upgrade), #57 (the feature, code-complete)

Sources for the Brevo record shapes (verify against the live Brevo dashboard, which
is authoritative and changes without notice):

- [Authenticate your domain with Brevo (Brevo code, DKIM, DMARC)](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [EasyDMARC — Brevo SPF & DKIM setup](https://easydmarc.com/blog/brevo-ex-sendinblue-spf-dkim-setup/)
