# ADR-0010: Move org email + files to Google Workspace (supersedes ADR-0004)

**Status:** Proposed — contingent on Google for Nonprofits eligibility being granted
**Date:** 2026-06-02
**Supersedes:** ADR-0004 (on acceptance)

## Context

ADR-0004 chose a deliberately lean email model: one readable mailbox (`info@moreska.eu`),
everything else forward-only via ImprovMX, "no mailbox proliferation." That was the right call
for the constraints known at the time. Lived experience since has exposed limits ADR-0004 didn't
anticipate, and surfaced new requirements outside its scope (it was email-only):

1. **`info@` is bottlenecked in one personal inbox.** ImprovMX forwards `info@` to Josip's
   personal Gmail. The secretary has **no direct access** — Josip relays mail to her. If Josip is
   unreachable, org mail is stuck in a personal account. This is both a daily friction and a
   bus-factor risk.
2. **ImprovMX is structurally incapable of fixing this.** It is **inbound forward-only**: there is
   no mailbox, no login, no storage behind `info@`. So it cannot provide (a) a shared inbox two
   people log into, (b) a clean dedicated `info@` inbox, or (c) the ability to **reply *as*
   `info@`** (replies go out from the forwardee's personal address). These are exactly what the
   secretary needs.
3. **New requirements beyond ADR-0004's scope:**
   - **Per-person org identity** — the secretary (and possibly president) want their own
     `@moreska.eu` mailbox they log into.
   - **Org-owned file storage (Drive)** — scores, the historical photo archive, tour-operator /
     charter contracts, member + financial records (the secretary is also treasurer), grant
     applications, registry/statut documents. These must belong to the *society*, not a departing
     volunteer's personal account.
   - **Org-owned Google services** — GBP, YouTube, Analytics, Ads under a multi-admin org identity
     rather than today's `moreska.cecilija@gmail.com` + personal accounts.
4. **The cost premise changed.** ADR-0004 weighed against paying for mailboxes. As a registered
   Croatian *udruga*, HGD should qualify for **Google for Nonprofits → Workspace for Nonprofits
   (free)**, validated via TechSoup using `OIB 52537805408` / `MB 03688194`. That largely dissolves
   ADR-0004's cost rationale.

## Decision

Adopt **Google Workspace on `moreska.eu`** as the org's mail + collaboration platform, **free
Nonprofits edition**, contingent on eligibility being granted.

- **`info@moreska.eu` becomes a real shared mailbox** (Workspace group / collaborative inbox, or a
  delegated mailbox) that Josip and the secretary both read directly, with native **reply-as
  `info@`**. This is the fix for the current bottleneck.
- **Start with minimal seats:** Josip + secretary (+ president only if he will actually log in).
  Section leaders get nothing — they don't read org mail. Add seats lazily. Even on a free tier,
  each seat is an account to secure and recover.
- **Personal identities** (e.g. `tajnica@moreska.eu`) layer on top as needed for outward identity.
- **Super-admin is an org-owned account, never a personal one**, with 2FA + recovery codes stored
  in the team password manager — same pattern as the `info@`-based Google account in #65. A recovery
  phone is enrolled for non-technical users to avoid lockout.
- **Drive: start on the free edition** (per-user Drive + a single shared folder owned by an org
  account). Upgrade to the discounted Business tier **only if** true domain-level **Shared Drives**
  prove necessary (the free / Business-Starter-equivalent edition does not include them).
- **Transactional ticket email stays on Brevo, unchanged.** Workspace handles *human* mail only;
  Brevo keeps sending QR-code confirmations from `tickets@` with its own DKIM. Marketing stays on
  the `bilten.moreska.eu` subdomain per ADR-0004. The ADR-0004 separation of transactional vs.
  human vs. marketing reputation is preserved.
- **The five ADR-0004 aliases** (`tickets@`, `pr@`, `bookings@`, `press@`, `dev@`) are re-homed as
  Workspace aliases / groups routing to `info@` or the relevant person. The *intent* of ADR-0004's
  forward-only aliases is kept; only the *mechanism* moves from ImprovMX to Workspace.

### Migration & sequencing

- **Do not bundle the `moreska.eu` MX flip with the #11 DNS cutover.** Both touch DNS, and the MX
  change shares the SPF/DKIM/DMARC surface that delivers ticket QR emails via Brevo. Fumbling
  alignment sends QR codes to spam — ADR-0004 flags that as a serious CX failure. Sequence the
  Workspace MX flip into a low-traffic window **after #11 stabilises**, and re-verify Brevo
  deliverability immediately after.
- **Optional interim stopgap** while TechSoup validation is pending (it has a long, uncertain lead
  time): add the secretary's inbox as a 2nd ImprovMX forward target for `info@` so she can at least
  *read* org mail. Caveat: mixed into her personal inbox, still no reply-as. A band-aid, not the
  solution.
- **Legacy `korcula-moreska.com` forwarding (#166) is handled separately** via a cPanel forward —
  **not** by adding the old domain as a Workspace secondary domain (it is slated for retirement).

## Considered options

1. **Stay on ImprovMX forward-only (ADR-0004 status quo).** Rejected: structurally cannot provide a
   login, a shared inbox, or reply-as. The bottleneck and bus-factor remain unsolved.
2. **ImprovMX paid SMTP add-on, or Brevo "send as", to bolt reply-as onto forwarding.** Rejected:
   still no real inbox/login for the secretary, and the Brevo path contaminates the same sending
   reputation that delivers ticket QR codes — the exact thing ADR-0004 isolated.
3. **Zoho Mail free tier** (real custom-domain mailbox, up to 5 users, free). Viable for *mail
   alone*, but gives no Google Drive / ecosystem. Rejected because the org explicitly wants its
   Google services under an org identity. Kept as a fallback if Workspace is somehow unavailable.
4. **Single shared free Gmail (`moreska.cecilija@gmail.com`) for everything.** Rejected: not
   domain-branded, requires password sharing, is itself a single bus-factor point, and has no admin
   controls.
5. **Paid Workspace at full price (~€6/user/mo).** Acceptable fallback if nonprofit eligibility is
   denied — it is the only option that meets all the requirements, so cost would be tolerated, but
   the decision's economics tighten and seat discipline matters more.

## Consequences

- **Pro:** resolves all four drivers at once — shared org inbox, per-person identity, org-owned
  Drive + Google services, reply-as `info@`, multi-admin recovery.
- **Pro:** likely zero marginal cost if eligible.
- **Pro:** ownership moves to the org/domain level — volunteer turnover stops risking account loss.
- **Con:** an MX migration with real deliverability risk to ticket email if fumbled; must be
  sequenced away from #11 and verified.
- **Con:** accounts to secure (2FA) and a lockout risk for non-technical volunteers; mitigated by
  recovery-phone + backup codes in the password manager at setup.
- **Con:** TechSoup validation is slow and uncertain, so this decision is **contingent**; until it
  lands, the status quo holds, with the optional stopgap above.
- **Con:** ongoing admin (user provisioning, super-admin custody) that the lean ImprovMX model
  avoided. Kept small by minimal seats.

## Related

- **Supersedes ADR-0004** (flip ADR-0004 to `superseded by ADR-0010` on acceptance; update the
  CLAUDE.md "Email sending" / "Email receiving" sections then too).
- **#166** — legacy `korcula-moreska.com` forwarding, decoupled.
- **#65** — org-owned Google account pattern (super-admin custody model reused here).
- **#11** — cutover; the Workspace MX flip must be sequenced after it.
- `docs/agents/domains.md` — legacy email inventory that surfaced this.
