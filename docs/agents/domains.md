# Domains & legacy email inventory

> Not to be confused with `domain.md` (singular), which is about how skills consume
> the repo's *domain documentation*. This file tracks **registered domains, DNS, and
> legacy org email addresses** — surfaced by issue #107 and tied to the #11 cutover.

Last updated: 2026-06-02. Owner: Josip (dev). Source trigger: legacy credentials folder
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
| `sv.cecilija@korcula-moreska.com` | Old-site `/contacts/` + homepage footer; cited as media contact on third-party pages | **Yes — actively published.** The canonical public address of the old site. | **Highest priority.** Needs a real forward → `info@moreska.eu` that survives cutover. See §4 — the #11 301 is HTTP-only and does NOT carry email. |
| `klapa@korcula-moreska.com` | `docs/migrations/README.md` (tested as Google acct in #37) | Exists; **not** found on current live pages — likely a section address / old flyers | Decide: forward → `info@` or retire. Bundle with the domain's mail decision (§4). |
| `glazba@korcula-moreska.com` | `docs/migrations/README.md` (tested in #37) | Exists; **not** found on current live pages | Same as `klapa@`. |
| `sv.cecilija@hi.t-com.hr` | `Pass internet.doc` (#107); inbox accessible (searched in #37) | **Not public** (not on live site or fininfo) but **mailbox receives mail** | HT auto-reply → `info@moreska.eu` if still live; else let lapse with the ADSL line. |
| `h.g.d.sv.cecilija@du.t-com.hr` | `Pass internet.doc` (#107) | Not found in public sweep | Same as above. |
| `sv.cecilija@hi.ht.hr` | `Pass internet.doc` (#107) | Not found in public sweep | Same as above. |
| `moreska.cecilija@gmail.com` | `docs/todo.md`; owns YouTube channel `@hgdsv.cecilija6051`; Josip has access | **Active org Gmail** (not legacy-to-retire) | Add `pr@moreska.eu` as recovery email for bus-factor (already a `docs/todo.md` TODO). |
| `info.nero3d@gmail.com` | Previous webmaster's personal Gmail (memory `project_legacy_webmaster_contact`) | Personal, not an org address | Out of scope — contact only. |
| `info@moreska.com` | `docs/marketing.md` | **Hypothetical** — only if HGD buys `moreska.com` (deferred to 2027) | Not a current address. Ignore for #107. |

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
- ☐ **HT mailbox check (needs human):** confirm whether mail to the three aliases still lands; if
  so, set an auto-reply pointing to `info@moreska.eu`. (HT business account access is in the
  password folder.)

---

## 3. Outstanding human-only tasks (issue #107)

These can't be done by an agent — they need logins held only by Josip:

1. **Log into Regica**, list every domain, fill §1 table, decide keep/lapse/renew per domain.
2. **HT mailbox**: check if the t-com aliases still receive mail; add auto-reply → `info@moreska.eu`.
3. **(Optional) Legacy WP DB grep** per the SQL above — low value if the site is being 301'd.
4. **One-off chore (no ticket):** move `cecilija-passes/` into a password manager and secure-delete
   the Desktop folder. As of 2026-06-02 the folder is **still on the Desktop** — passwords sitting
   in plaintext `.txt`/`.doc` files.

---

## 4. GAP: post-launch handling of `sv.cecilija@korcula-moreska.com` (no issue owns this)

As of 2026-06-02 **no issue covers what happens to mail sent to the old addresses after cutover.**
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
