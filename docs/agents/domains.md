# Domains & legacy email inventory

> Not to be confused with `domain.md` (singular), which is about how skills consume
> the repo's *domain documentation*. This file tracks **registered domains, DNS, and
> legacy org email addresses** — surfaced by issue #107 and tied to the #11 cutover.

Last updated: 2026-07-16 (added §5 email-auth DNS). Owner: Josip (dev). Source trigger: legacy credentials folder
(`cecilija-passes/`) found on Desktop, which revealed a second registrar ("Regica") nobody
knew about, plus a set of deprecated `t-com.hr` email aliases.

---

## 1. Registrar inventory

### Totohost — known

| Domain | Registrar | DNS | Status | Notes |
|---|---|---|---|---|
| `moreska.eu` | Totohost | Hetzner DNS (`hydrogen/oxygen/helium.ns.hetzner.com`) | **Active — primary** | Nameserver delegation handed to Hetzner. Production site. |
| `korcula-moreska.com` | Totohost (assumed) | — | **Active — legacy WP** | Old WordPress site. Stays up read-only through end of 2026 season so `checkinera` keeps scanning legacy QRs (`docs/todo.md` §0). 301 → `moreska.eu` planned at/after cutover (#11). |

### Regica — UNKNOWN, needs human login (issue #107, Task 1)

A second registrar ("Regica") was discovered via `cecilija-passes/Password za Regica domene.txt`.
**Credentials are out of scope for this repo — they live only in the password folder / a password manager.**
Nobody has logged in yet, so the domain list below is empty pending a human session.

| Domain | Resolves to | Decision (keep+move to Hetzner / let lapse / renew at Regica) | Done |
|---|---|---|---|
| _(to be filled after Regica login)_ | | | ☐ |

**Why this matters:** if a legacy `.hr` (or other) domain on Regica still resolves to the old
WP site and we don't know about it, search engines and bookmarks keep pointing at the old site
after the #11 cutover. For each domain found, decide whether to 301 → `moreska.eu` or drop it.

---

## 2. Legacy org email addresses

Canonical address is now **`info@moreska.eu`** (ImprovMX forwarder → personal inbox; see CLAUDE.md).
All addresses below are **deprecated** and should be replaced with `info@moreska.eu` wherever found.

Full inventory after the 2026-06-02 sweep (repo + live web). The `@korcula-moreska.com`
and `@gmail.com` addresses below are **not** in #107's text — found via `docs/migrations/README.md`
(the #37 GA4 owner hunt) and the live old site.

| Address | Where it lives | Public / in use? | Action |
|---|---|---|---|
| `sv.cecilija@korcula-moreska.com` | Old-site `/contacts/` + homepage footer; cited as media contact on third-party pages | **Yes — actively published.** The canonical public address of the old site. | ✅ **DONE (2026-06-02).** cPanel forwarder → `info@moreska.eu`, tested working. See §2.1 for the Email Routing gotcha that had to be fixed first. |
| `klapa@korcula-moreska.com` | `docs/migrations/README.md` (tested as Google acct in #37) | Exists; **not** found on current live pages — likely a section address / old flyers | ✅ **DONE (2026-06-02).** cPanel forwarder → `info@moreska.eu` (forwarded rather than retired, to catch stragglers on old flyers/listings). |
| `glazba@korcula-moreska.com` | `docs/migrations/README.md` (tested in #37) | Exists; **not** found on current live pages | ✅ **DONE (2026-06-02).** cPanel forwarder → `info@moreska.eu`. |
| `tickets@korcula-moreska.com` | Old-site ticketing (Tickera/WooCommerce order + confirmation mail) | Legacy ticketing address; **not** found on current live pages | ☐ **TODO.** Add cPanel forwarder → `info@moreska.eu` (same one-time Email Routing fix as §2.1 already applies) to catch stragglers replying to old order confirmations. |
| `sv.cecilija@hi.ht.hr` | `Pass internet.doc` (#107) | **Yes — active inbox, lots of mail.** On the **tportal.hr Roundcube** backend. | ⏳ **Awaiting HT (official email sent 2026-06-03).** This Roundcube (1.4.8) has **no `managesieve` plugin** → no forwarding/filters UI, and the Moj Telekom portal's Internet card manages only the `du.ht.hr` mailbox, not this one. Official request emailed to HT Poslovni asking for a server-side forward → `info@moreska.eu`, keep-a-copy ON (covers all three HT/t-com addresses + the alias question). Awaiting reply. See §2.1. |
| `h.g.d.sv.cecilija@du.ht.hr` (= `@du.t-com.hr`) | `Pass internet.doc` (#107); shown as "e-mail korisnika" on the portal Internet service | **Yes — separate active mailbox** on the **webmail.ht.hr AXIGEN** backend (NOT an alias of `hi.ht.hr`, as earlier assumed) | ✅ **DONE + TESTED (2026-06-03).** AXIGEN webmail → Postavke → Filteri → "Proslijedi za" → `info@moreska.eu`, no delete action so a copy stays. Outside-inbox test passed: the forwarded copy arrived **in the Inbox** (not spam), "from `h.g.d.sv.cecilija@du.t-com.hr` via moreska.eu". See §2.1. |
| `sv.cecilija@hi.t-com.hr` | `Pass internet.doc` (#107); inbox accessible (searched in #37) | Receives mail; **cascade into `hi.ht.hr` assumed but NOT verified** | ⏳ **Awaiting HT.** Included in the 2026-06-03 official email (forward → `info@moreska.eu` + the "separate mailbox or alias of `hi.ht.hr`?" question). |
| `moreska.cecilija@gmail.com` | `docs/todo.md`; owns YouTube channel `@hgdsv.cecilija6051`; Josip has access | **Active org Gmail** (not legacy-to-retire) | ✅ **Forward set + confirmed + TESTED (2026-06-03)** → `info@moreska.eu` (Gmail keeps a copy; account stays as YouTube owner). Gmail forwarding confirmation link was clicked to activate it; outside-inbox test passed (arrived "via improvmx-mails.com"). ⚠️ The forwarded copy **landed in Spam** ("similar to messages identified as spam in the past") — clicked **Report not spam** so future ones route to Inbox; watch that it sticks. Still add `pr@moreska.eu` as recovery email for bus-factor (`docs/todo.md` TODO). |
| `info.nero3d@gmail.com` | Previous webmaster's personal Gmail (memory `project_legacy_webmaster_contact`) | Personal, not an org address | Out of scope — contact only. |
| `info@moreska.com` | `docs/marketing.md` | **Hypothetical** — only if HGD buys `moreska.com` (deferred to 2027) | Not a current address. Ignore for #107. |

### 2.1 Wiring as built (2026-06-02)

**`@korcula-moreska.com` — cPanel forwarders, live + tested.** Three (`sv.cecilija@`,
`klapa@`, `glazba@`) now forward to `info@moreska.eu` via Totohost cPanel → Email → Forwarders.
A fourth, `tickets@korcula-moreska.com` (old Tickera/WooCommerce ticketing address), is still
**TODO** — add the same forwarder so replies to legacy order confirmations aren't lost.

> **Gotcha that blocked it first:** `moreska.eu` is itself a domain *inside the same Totohost
> cPanel account* (registered at Totohost), and its mail was set to **Local Mail Exchanger**.
> So cPanel tried to deliver `info@moreska.eu` locally (where no `info@` mailbox exists) and
> refused the forwarder with *"already sends that email to the default address."* Fix: cPanel →
> Email → **Email Routing** → `moreska.eu` → set to **Remote Mail Exchanger** (so the server
> honours moreska.eu's real MX = ImprovMX). After that the forwarders save and reach the real
> inbox. If you ever add another `@korcula-moreska.com` forwarder, this stays fixed — it's a
> one-time per-domain setting.

**HT mail — UPDATED 2026-06-03 after hands-on attempt. There are TWO separate HT mailboxes on
TWO different webmail backends (the earlier "all aliases cascade into `hi.ht.hr`" assumption was
wrong):**

1. **`h.g.d.sv.cecilija@du.ht.hr` — DONE.** This is the "e-mail korisnika" tied to the Internet
   service in the Moj Telekom Poslovni portal. It lives on the **AXIGEN** webmail (`webmail.ht.hr`),
   which *does* expose filters. Forward set via **Postavke → Filteri → Dodaj filter → "Proslijedi za"
   → `info@moreska.eu`** with no move/delete action (so the original stays = keep-a-copy). ✅ **Tested
   2026-06-03:** a test sent from an outside Gmail to `du.t-com.hr` arrived in the destination Inbox
   "from `h.g.d.sv.cecilija@du.t-com.hr` via moreska.eu" (not spam).

2. **`sv.cecilija@hi.ht.hr` — awaiting HT (official email sent 2026-06-03).** This is a busy active inbox but
   lives on the **tportal.hr Roundcube** webmail (`webmail.tportal.hr`), a *different* backend.
   That Roundcube is **v1.4.8 with no `managesieve` plugin** (installed dodaci: `filesystem_attachments`,
   `jqueryui`, `keycloak`, `multimap`) → it has **no Filteri / forwarding UI at all**. The Moj Telekom
   portal's Internet card only manages the `du.ht.hr` mailbox, not this one. So there is **no
   self-service path** to forward `hi.ht.hr`. **An official request was emailed to HT Poslovni support on
   2026-06-03** asking them to set server-side forwards for all three HT/t-com addresses (`hi.ht.hr`,
   `hi.t-com.hr`, `du.t-com.hr`) → `info@moreska.eu`, keep-a-copy ON, plus the alias question for
   `hi.t-com.hr`. Awaiting reply; test each forward once HT confirms. (Contact channels: Moj Telekom
   Poslovni portal chat/ticket, or phone 0800 0005 / 0800 0900.)

> **Interim caveat (ties to #173):** `info@moreska.eu` is currently just an ImprovMX forward to a
> personal inbox — it is *not* a real shared mailbox yet, and has no reply-as. So forwarding the
> society's main inbox there dumps all org mail into one personal inbox and replies won't come
> *from* the org identity. That's acceptable as a "don't lose inquiries" stopgap, but it's exactly
> the gap #173 (Google Workspace shared `info@`) closes. Keep-a-copy ON in HT so nothing is lost
> while Workspace is provisioned; watch the destination spam folder (chained forwards can trip
> spam filters).

### Sweep status (Task 2)

- ✅ **Public web sweep done (2026-06-02):** none of the three `t-com.hr`/`ht.hr` aliases appear
  on the live `korcula-moreska.com` site or in the public business registry (fininfo.hr). The only
  address publicly published on the old site is **`sv.cecilija@korcula-moreska.com`** (homepage
  footer + `/contacts/`), which is also cited as the media contact on third-party tourism pages.
- ✅ **Public registry (fininfo.hr):** lists website `www.korcula-moreska.com`, **no email**.
  Website field still needs updating to `moreska.eu` post-cutover (already noted in CLAUDE.md).
- ☐ **Legacy WP DB grep — NOT done (needs human/DB access).** The `wpbp_*` tables can only be
  reached via Totohost cPanel/phpMyAdmin or a DB export; neither is available to an agent. Given
  the old site is going read-only and will be 301'd, editing its stored content is low value —
  but if you want it thorough, export the DB (or run in phpMyAdmin):
  ```sql
  -- run against each wpbp_ table that stores content/options, e.g.:
  SELECT * FROM wpbp_options    WHERE option_value LIKE '%t-com.hr%' OR option_value LIKE '%ht.hr%';
  SELECT * FROM wpbp_posts      WHERE post_content LIKE '%t-com.hr%' OR post_content LIKE '%ht.hr%';
  SELECT * FROM wpbp_postmeta   WHERE meta_value   LIKE '%t-com.hr%' OR meta_value   LIKE '%ht.hr%';
  ```
  Replace any hits with `info@moreska.eu`.
- ⚠️ **HT mailbox check — REVISED 2026-06-03:** there are **two** separate active HT mailboxes on
  two webmail backends (not one hub). `h.g.d.sv.cecilija@du.ht.hr` (AXIGEN) is **forwarded** ✅
  (test pending); `sv.cecilija@hi.ht.hr` (tportal Roundcube, no managesieve) **cannot self-forward**,
  so an **official email was sent to HT Poslovni support 2026-06-03** ⏳ (covers all three HT/t-com
  addresses + the alias question; awaiting reply). See §2.1 for the full backend split.

---

## 3. Outstanding human-only tasks (issue #107)

These can't be done by an agent — they need logins held only by Josip:

1. **Log into Regica**, list every domain, fill §1 table, decide keep/lapse/renew per domain.
2. **HT mailboxes** (two backends — see §2.1):
   - `h.g.d.sv.cecilija@du.ht.hr` ✅ forwarded via AXIGEN webmail filter; ☐ test from outside inbox.
   - `sv.cecilija@hi.ht.hr` + `sv.cecilija@hi.t-com.hr` ⏳ **official email sent to HT Poslovni 2026-06-03**
     requesting server-side forwards → `info@moreska.eu`, keep-a-copy ON, plus the "separate or alias?"
     question. Awaiting reply; test each once HT confirms. (Self-service is impossible — tportal Roundcube
     has no managesieve, and the portal doesn't manage these mailboxes.)
3. **(Optional) Legacy WP DB grep** per the SQL above — low value if the site is being 301'd.
4. **One-off chore (no ticket):** move `cecilija-passes/` into a password manager and secure-delete
   the Desktop folder. As of 2026-06-02 the folder is **still on the Desktop** — passwords sitting
   in plaintext `.txt`/`.doc` files.

---

## 4. Post-launch handling of legacy email — RESOLVED by #166

> **Status (2026-06-03):** This gap is owned by **#166** and largely executed. The three
> `@korcula-moreska.com` forwarders are live + tested; `h.g.d.sv.cecilija@du.ht.hr` and the org Gmail
> `moreska.cecilija@gmail.com` are forwarded (tests pending) (§2.1). **Remaining: `sv.cecilija@hi.ht.hr`
> + `sv.cecilija@hi.t-com.hr` — an official email was sent to HT Poslovni support 2026-06-03** (their
> tportal Roundcube has no forwarding UI and the portal doesn't manage them); awaiting reply. The original
> analysis is kept below for context. The one hard sequencing constraint still stands: **do not decommission
> any legacy mailbox/MX until its forward is live and tested.**

The original gap analysis:

What exists:

- **#53 (closed)** — provisioned the *new* `moreska.eu` aliases (`tickets@`, `pr@`, `bookings@`,
  `press@`, `dev@` → `info@`). Forward-only model per **ADR-0004**.
- **#65 (closed)** — created the HGD-controlled Google account on `info@moreska.eu`.
- **#107 (this)** — *audits* the legacy addresses. It does not own a forwarding decision.
- **#11 (cutover)** — sets up a **301 HTTP redirect** `korcula-moreska.com` → `moreska.eu`.

**The trap:** a 301 redirect is HTTP only — it does **not** carry email. `sv.cecilija@korcula-moreska.com`
is the address printed on the old site's `/contacts/`, its footer, and third-party tourism pages,
so people (and tour operators) will keep emailing it for years. The moment the
`korcula-moreska.com` MX records / cPanel mailbox are decommissioned, that mail **silently bounces**
and the org loses inquiries — exactly the customers most likely to book.

**Recommended fix (needs a decision + an issue):** before tearing down the old mail setup, add a
forward `sv.cecilija@korcula-moreska.com` → `info@moreska.eu`. Mechanism depends on where the
domain's mail lives post-cutover:
- If `korcula-moreska.com` stays on Totohost cPanel through 2026 (it does, per `docs/todo.md` §0):
  add a cPanel **forwarder** now, zero cost.
- If/when the domain's DNS moves to Hetzner: re-point MX to ImprovMX and add the forward there
  (same pattern as `info@moreska.eu`), OR keep a catch-all forward.
- Decide the same for `klapa@` / `glazba@` (likely just retire — low/no current traffic).

This is small but genuinely load-bearing for the cutover. Worth its own `ready-for-human` issue
linked from #11, or a checklist item inside #11.

---

## 5. Email authentication DNS (SPF / DKIM / DMARC / BIMI)

> Outbound sender-auth records for the two sending domains, as opposed to §1–§4 which cover
> registrar / receiving / legacy forwarding. **Owner: #346 (BIMI).** Records below verified live
> via `dig` **2026-07-16**.

Two domains send mail, both through **Brevo**:
- **`moreska.eu`** — transactional (ticket confirmations from `tickets@moreska.eu`, other org mail
  from `info@moreska.eu`) + human "send as `info@moreska.eu`" from Gmail via the Brevo SMTP relay.
  Inbound MX is **ImprovMX** (receiving/forwarding only — it does not sign or send *as* moreska.eu).
- **`bilten.moreska.eu`** — marketing/newsletter (`newsletter@bilten.moreska.eu`), ADR-0004.

### Live records (both verified 2026-07-16)

| Record | Type | Value |
|---|---|---|
| `moreska.eu` (SPF) | TXT | `v=spf1 include:spf.brevo.com include:spf.improvmx.com ~all` |
| `bilten.moreska.eu` (SPF) | TXT | `v=spf1 include:spf.brevo.com -all` |
| `brevo1._domainkey.moreska.eu` / `brevo2…` | CNAME | → `b1.moreska-eu.dkim.brevo.com` / `b2…` (Brevo DKIM) |
| `brevo1._domainkey.bilten.moreska.eu` / `brevo2…` | CNAME | → `b1.bilten-moreska-eu.dkim.brevo.com` / `b2…` |
| `_dmarc.moreska.eu` | TXT | `v=DMARC1; p=quarantine; rua=mailto:rua@dmarc.brevo.com; adkim=r; aspf=r` |
| `_dmarc.bilten.moreska.eu` | TXT | `v=DMARC1; p=quarantine; rua=mailto:rua@dmarc.brevo.com; adkim=r; aspf=r` |

**DMARC is already at enforcement (`p=quarantine`, no `pct`)** on both domains — this is the BIMI
prerequisite, so BIMI is unblocked. How alignment resolves for a real Brevo send (from the live
Gmail `Authentication-Results` of a ticket email, 2026-07-16):

```
dkim=pass  header.i=@moreska.eu  header.s=brevo2       ← DKIM aligned → carries DMARC
spf=pass   smtp.mailfrom=bounces-…@ae.d.mailin.fr      ← Brevo bounce domain, NOT aligned to moreska.eu
dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=moreska.eu
```

> **Why the SPF `include:spf.brevo.com` on `moreska.eu` doesn't affect DMARC:** Brevo sends with an
> envelope-from on its own bounce domain (`*.mailin.fr`), so SPF authenticates *that* domain, never
> aligns to `moreska.eu`, and DMARC passes purely on **DKIM** alignment (`d=moreska.eu`). The SPF
> include is still correct to keep (belt-and-suspenders, and it covers the relay path), just not the
> thing carrying DMARC here.

### BIMI — remaining step (#346)

DMARC enforcement + DKIM alignment + the logo asset are all in place; the only unpublished piece is
the two BIMI TXT records. The logo is served at **`https://moreska.eu/email/bimi-logo.svg`** (HTTP
200, `image/svg+xml`, BIMI-profile `baseProfile="tiny-ps"`, `<title>`, square `viewBox`; PR #353,
issue #345). Publish in Hetzner DNS:

| Record | Type | Value |
|---|---|---|
| `default._bimi.moreska.eu` | TXT | `v=BIMI1; l=https://moreska.eu/email/bimi-logo.svg; a=;` |
| `default._bimi.bilten.moreska.eu` | TXT | `v=BIMI1; l=https://moreska.eu/email/bimi-logo.svg; a=;` |

`a=;` explicitly declares "no VMC/CMC certificate" (correct for the free stack). Cert-free BIMI shows
the logo in Fastmail and a few others; **Gmail/Apple/Yahoo still require a paid VMC/CMC** to render it
(deferred). After publishing, verify with a delivered message to a cert-free client.

> **Testing gotcha — a "send as `info@moreska.eu`" *to your own Gmail* does NOT verify the relay
> path.** Gmail loop-delivers same-account mail internally (no `Received` / `Authentication-Results`
> headers, `@mail.gmail.com` Message-ID), so it can't confirm SPF/DKIM/DMARC. To test the Gmail→Brevo
> relay path, send to a **non-Gmail** mailbox or a checker (`check-auth@verifier.port25.com`,
> mail-tester.com) and read the auth result there. The **transactional** path is genuinely exercised
> by any real Brevo-sent ticket email inbound to Gmail (that's how the results above were captured).
