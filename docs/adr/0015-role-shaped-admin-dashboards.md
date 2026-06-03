# ADR-0015: Role-shaped admin dashboards + Croatian-by-default i18n

**Status:** Accepted
**Date:** 2026-06-04

## Context

[ADR-0006](./0006-three-tier-admin-roles.md) introduced the three internal roles (`superadmin | admin | tehnika`, later joined by `partner` from [ADR-0008](./0008-partner-sales-channel.md)) and a custom `/admin` landing that branches on role. In practice the landing under-served its two most important audiences:

- **The secretary (`admin`)** sees the *same* dashboard as the developer (`isAdminTier` covers both): a season-aggregate block, a four-button action row, and a "last 7 days + upcoming" table — all in **English**, with DB-flavoured columns ("Online sold"). She is a non-technical, Croatian-speaking user who thinks in money and shows, not tables. The "Record in-person sale" button dead-ends at the raw Shows *list*, the clunkiest path on the page.
- **The developer (`superadmin`)** gets that same business view but no diagnostics — no environment/DB guard (despite repeated prod/staging confusion), no data-integrity signal, no visibility into the project's recurring failure mode: **errors that return success and are seen by no one** (the dead contact form, silent Brevo email failures, the gtag bug).

The door (`tehnika`) and reseller (`partner`) dashboards exist and work but lead with numbers where the user leads with an action, and everything is English for users who are Croatian.

The brief: each role's landing should show what *that* role cares about, in their language, in a simple and appealing way — encapsulating the underlying tables into values and graphs, not exposing them.

## Decision

One business-language dashboard, layered by role; the two operational dashboards reshaped action-first; the whole admin localized.

**`admin` (secretary) — the canonical dashboard.** Upcoming-show-first: the next show as a hero with a capacity **fill bar** + remaining seats, the following 2-3 shows as smaller bars, and a persistent **season summary band** (revenue collected, partner receivable, tickets sold, % of season capacity). One real chart — a **season-trajectory bar chart** (tickets sold per show vs capacity) — plus a **channel-mix split** (online / in-person / partner), which she watches because she enters in-person counts and reconciles partner receivable. Actions are contextual: **record in-person sale is inline on each show card** (kills the dead-end button); the only global buttons are **+ New show** and **Find order**; inquiries surface as a **live badge** ("5 new — incl. 2 booking enquiries"), not a static button.

**`superadmin` (developer) — same dashboard + a collapsed dev strip.** He is *not* given a separate raw-table landing: Payload's left sidebar already *is* the raw view, so a second one only duplicates it. The strip (English, independent of the language toggle) carries diagnostics no single table gives: an **environment + DB guard** banner, **data-integrity anomaly counts** (orders with no tickets, tickets with no order, past shows still `active`, refunds stuck `pending`/`failed`), **integration health** (last webhook, last cron, Stripe balance), **quick collection links**, and the **critical-events log**.

**Money is never labelled "profit".** The system cannot know costs, so a "profit" tile would be a mislabelled gross figure. The dashboard shows two separate facts: **Revenue collected** (cash in hand — online net of refunds + in-person) and **Partner receivable (invoiced monthly)**, never summed.

**`tehnika` (door) — action-first.** A large live **"X / Y ušlo"** (admitted / sold) progress hero for the active door show, a dominant **Skeniraj kartu** button (the existing in-page `html5-qrcode` viewfinder — *not* a native-camera-first flow), and a **lookup / manual-admit fallback** that extends the existing audited, active-show-scoped `POST /api/orders/lookup` seam (#87) with an **order-code** key. A match shows name + party + show + status and a **Pusti (Admit)** button doing the same atomic mark-scanned; manual admit always resolves to a real ticket. The result card **persists indefinitely** with three peer actions: Skeniraj novu / Pusti cijelu grupu (N) / Natrag.

**`partner` (reseller) — POS-first.** The sell flow stays the hero; a **live month-to-date standing card** surfaces, from the partner's perspective, the same euros the org calls "receivable": tickets sold this month, **you owe HGD** (`(sold − cancelled) × face − commission`), and **your commission**. Same-day storno, recent sales, and the formal monthly statement PDF sit below.

**Croatian-by-default i18n (Payload-native).** Configure Payload `i18n: { supportedLanguages: { en, hr } }` (Croatian ships in `@payloadcms/translations`). This localizes the *entire* admin chrome, not just the custom dashboard, and exposes Payload's **native per-user language selector** in account settings — that *is* the user toggle, with no bespoke field. The custom dashboard reads the active `req.i18n.language` and renders its own copy from a small HR/EN map. Per-role defaults: **`admin`/`tehnika`/`partner` → Croatian, `superadmin` → English**, each overridable; the persisted user choice wins.

**Critical-events log.** A persisted table the app writes to at known failure seams (silent email-send failures, webhook signature failures, refund failures, unhandled 500s); the dev strip shows the last N. Curated sink, not log aggregation — raw container/stdout logs are out of scope.

**Enquiry lifecycle.** `ContactSubmissions` gains a `status: new → handled` field so the inquiries badge can count `new` honestly; booking-type enquiries (`private-moreska` / `moreska-experience`) are highlighted within the total as revenue leads.

**Visual language.** Payload-native surfaces (theme tokens, dark-mode-safe) with restrained brand accents — gold for key figures and chart fills, Bodoni Moda SC for hero numbers. Not a full brand reskin.

## Alternatives considered

**A separate raw, table-first landing for superadmin.** Rejected. The user framed superadmin as "wants the data as it is in the DB," but Payload's sidebar already delivers that. A second raw view duplicates the sidebar; the landing's unique value is the cross-collection at-a-glance. Superadmin gets the business view + diagnostics instead.

**A single bottom-line "profit" number.** Rejected as actively misleading: the system has no cost data and three channels with different cash timing (online paid now, partner invoiced monthly, in-person cash). "Revenue collected" + "partner receivable", shown apart, is the honest model.

**A bespoke per-role language field affecting only the dashboard.** Rejected once code showed Croatian ships in `@payloadcms/translations`. Payload-native i18n localizes all of Payload, provides the user toggle for free, and dissolves the "deeper forms stay English" problem a dashboard-only field would leave.

**Time-window "new" for the inquiries badge** (no schema change). Rejected — it re-surfaces answered enquiries and hides un-answered old ones. A real `status` lifecycle is correct, not gold-plating.

**Raw container/stdout logs piped into the admin** for the "error logs" the developer asked for. Rejected: high effort, low signal, host-bound and noisy. A curated critical-events table targets exactly the silent-success failures this project has repeatedly hit.

**Full brand reskin of the dashboard.** Rejected: a Bodoni/stone-gold island inside Payload's grey chrome reads as disjointed and fights dark mode. Accents-on-native gives the appeal without the seams.

**Leaving tehnika/partner untouched.** Initially scoped out (recently built), then pulled back in: both are reshaped action-first and localized, but their underlying flows, access scoping, and the `order-lookups` audit are preserved.

## Consequences

- **Schema additions:** `ContactSubmissions.status` (`new` default), and a `critical-events` (or `error_log`) table written at failure seams. Both flow through the bootstrap-SQL pattern ([ADR-0013](./0013-schema-management-bootstrap-sql-drift-gate.md)); any accumulating writes stay atomic.
- **i18n config is global-ish state.** Adding `supportedLanguages` changes every admin user's experience at once. Per-role defaults are seeded (hook or migration) but the persisted user preference always wins; a new `superadmin` sees the seeded English default. The custom dashboard must maintain an HR/EN string map for its own copy — a small ongoing translation surface that drifts if neglected (keep it beside the component).
- **The PII rule for tehnika is softened, deliberately and narrowly:** from "no PII" to "name + party + status of a *specifically-searched* ticket, never financials, never a browsable buyer list." This is consistent with the already-shipped, audited `/api/orders/lookup`; the Admin-tiers table in `CONTEXT.md` is updated to match. Adding order-code as a search key does not widen scope or bypass the `order-lookups` audit.
- **The "Revenue collected" figure is more than today's `totalRevenueCents`** (which is online gross only). Computing true collected revenue requires netting refunds and adding in-person cash; partner receivable is a separate computation already available from the reconciliation modules.
- **The critical-events log is only as good as its write-sites.** It catches what we instrument; the known seams (email send, webhook verify, refund, 500 handler) must each be wired, and new failure-prone seams should add a write. It is a curated signal, not automatic coverage.
- **Notification email on enquiry** is a related, separately-tracked fix (the forms persist since #220 but send nothing); the badge and the inbox notification are complementary surfaces for the same lead.
- **Deeper Payload form polish** (field labels, help text in Croatian beyond Payload's built-in strings) remains a later pass; this ADR localizes the chrome and the dashboard, not every collection field's custom labels.
- The role-branching `/admin` component grows; each role's view should be a separate sub-component to keep the branch readable, with shared money/format helpers extracted.
