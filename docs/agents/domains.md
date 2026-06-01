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

| Address | Source | Still public? | Action |
|---|---|---|---|
| `sv.cecilija@hi.t-com.hr` | `Pass internet.doc` (per #107) | **No** — not on live site or fininfo registry (web sweep 2026-06-02) | Historical only (old flyers / mailbox). Set HT auto-reply if mailbox still receives. |
| `h.g.d.sv.cecilija@du.t-com.hr` | `Pass internet.doc` (per #107) | **No** — not found in public sweep | Historical only. Same as above. |
| `sv.cecilija@hi.ht.hr` | `Pass internet.doc` (per #107) | **No** — not found in public sweep | Historical only. Same as above. |
| `sv.cecilija@korcula-moreska.com` | **Live site footer** (found 2026-06-02, NOT in #107) | **Yes** — footer of `korcula-moreska.com` homepage | Replace in legacy WP DB / footer when site is touched; covered by 301 after cutover otherwise. |

### Sweep status (Task 2)

- ✅ **Public web sweep done (2026-06-02):** none of the three `t-com.hr`/`ht.hr` aliases appear
  on the live `korcula-moreska.com` homepage or in the public business registry (fininfo.hr).
  The live site footer instead exposes `sv.cecilija@korcula-moreska.com`.
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
