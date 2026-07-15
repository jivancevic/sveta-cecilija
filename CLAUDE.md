# CLAUDE.md

> **This file is a map + hard rules. Detail lives one click away** in `docs/agents/*.md` and `docs/adr/*.md` — follow the pointers instead of duplicating their content here. Facts owned by code or an ADR are *linked, not copied* (inline copies drift stale). When you're tempted to add a multi-paragraph gotcha, put it in the relevant `docs/agents/` file and leave a one-line pointer.

## Agent docs index

| Topic | Where |
|---|---|
| Issue tracker (GitHub Issues) | `docs/agents/issue-tracker.md` |
| Triage labels (five-role vocabulary) | `docs/agents/triage-labels.md` |
| Schema + DB patterns — bootstrap, enum migrations, atomic & race-safe SQL, TRUNCATE CASCADE | `docs/agents/db-bootstrap.md` (+ `db/schema/README.md`) |
| Deployment + DB topology — Coolify, Dockerfile/standalone build, env promotion, dev/prod/staging DB names | `docs/agents/deployment.md` |
| Working in worktrees / parallel sessions — `.env.local`, devDeps, push-hang, `gh pr merge` | `docs/agents/worktree-dev.md` |
| Payload admin customization (v3) — component paths, importMap, CSRF gate | `docs/agents/payload-admin.md` |
| Frontend & CSS gotchas — specificity, `backdrop-filter`, hero loading, `next/image` | `docs/agents/frontend-css.md` |
| Assets pipeline — `public/` vs `assets/`, webp conversion | `docs/agents/assets.md` |
| Feature design notes — #94 bad-weather venue change, show reschedule, #57 marketing opt-outs | `docs/agents/features.md` |
| Domain glossary | `CONTEXT.md` (single context; see `docs/agents/domain.md`) |
| Architecture decisions | `docs/adr/` |

## Hard rules (don't violate; each enforced where noted)

- **Never build internal URLs with a `/en` or `/hr` prefix** — locale is cookie-based, those routes 404 (`src/proxy.ts`).
- **Never query the Shows collection directly in page components** — go through `getUpcomingShows()` / `getNextShow()` in `src/lib/shows.ts`.
- **There is no `capacity` field on Shows and never add one** — capacity is fixed per venue (`VENUE_CAPACITY` in `src/lib/shows.ts`).
- **Ticket prices are fixed: €20 adult, €10 child** — no dynamic pricing.
- **Roles are `superadmin | admin | tehnika | partner`** — read predicates from `src/lib/access/roles.ts`, never hardcode the list elsewhere. (`door-staff` is a retired label.)
- **Admin-only mutation routes must re-check the role in the handler** — Payload's local API runs `overrideAccess: true`, so collection `access` doesn't gate them. Use `requireRole(req, predicate)` from `src/lib/access/route-guard.ts` (the single chokepoint); don't re-type `getPayload → auth → role check` inline. Token/signature routes (Stripe webhook, `/scan/[token]/claim`, unsubscribe, cron) are the only exceptions.
- **Accumulating numeric columns must use atomic SQL** (`col = col + $1`), never read-modify-write. See `db-bootstrap.md`.
- **Secrets (Stripe live keys, `BREVO_API_KEY`, `PAYLOAD_SECRET`) never appear in any committed file or chat** — runtime env only (Coolify); if one leaks, rotate it.
- **`.gitignore` blocks every `.env*` except `.env.example`** (the committed template).
- **Don't relax the security baseline** — `next.config.ts` security headers + `payload.config.ts` fail-fast on missing `PAYLOAD_SECRET`. That baseline is what lets `/scan/[token]` be safely public.

---

## Project: moreska.eu — HGD Sveta Cecilija

Website for HGD Sveta Cecilija, a 143-year-old cultural organisation from Korčula, Croatia, home of the Moreška sword dance. Public site at `moreska.eu`. Full PRD in GitHub Issues #1. **Cutover is complete (verified 2026-06-25):** `moreska.eu` is live and taking real Stripe sales; both legacy domains 301-redirect to it. The project is now in the operate / go-to-market / compliance phase — most open work is human/ops-gated (marketing, email/DNS, fiscalization #297). For current open work, run `gh issue list --state open`.

### Organisation registry details

Use these when filling out third-party platform business/verification forms (Meta Business Manager, Stripe, Google Ads, etc.). Source: https://www.fininfo.hr/Poduzece/Pregled/hrvatsko-glazbeno-drustvo-svcecilija-korcula/Detaljno/605996.

| Field | Value |
|---|---|
| Legal name | `HRVATSKO GLAZBENO DRUŠTVO SV.CECILIJA - KORČULA` |
| OIB (tax ID) | `52537805408` |
| MB (registry no.) | `03688194` |
| Registered address | `Knežev prolaz 1, 20260 Korčula, Croatia` |
| Phone | `+385 92 1532305` |
| Legal form | Membership organisation (`Djelatnosti ostalih članskih organizacija`) |
| Date of establishment | 1991 (current Croatian legal entity; the society itself dates to 1883 — use 1991 for any "company founded" registry field) |
| Authorised representative | Velebit Veršić (President) |
| Website (for new forms) | `https://moreska.eu` |

Registry still lists `www.korcula-moreska.com` as the official website — update post-DNS-cutover.

### Stack

- **Framework:** Next.js 16 (App Router, TypeScript).
- **Styling:** Tailwind CSS + custom CSS (`src/app/globals.css`). Scope map + breakpoints under [CSS architecture](#css-architecture); gotchas in `docs/agents/frontend-css.md`.
- **i18n:** Locale is **not** in the URL. `src/proxy.ts` reads the `moreska_locale` cookie (or `Accept-Language` on first visit) and forwards it via an `x-locale` header; pages call `getLocale()` (`src/lib/locale.ts`). Translations in `src/messages/{en,hr}.json` (must stay structurally identical — dict type is inferred from `en.json`). Helper: `src/lib/i18n.ts`.
- **Fonts:** Brand identity Option 1 (picked 2026-06), loaded via `next/font/local` from `assets/fonts/brand/` in `src/app/(frontend)/fonts.ts`: Labrada (`--font-bodoni`, headlines/titles), Labrada (`--font-inter`, body), Neue Haas Grotesk Display (`--font-ibm-plex-mono`, codes/tags). Variable names kept for backwards compat with `globals.css`. The Payload admin (`(payload)/custom.css`) still pulls Bodoni Moda SC via the Google Fonts CDN for its own accents.
- **CMS:** Payload CMS v3 (`@payloadcms/next`, integrated into the Next.js app). Admin at `/admin`. Customization gotchas: `docs/agents/payload-admin.md`.
- **Database:** PostgreSQL via `@payloadcms/db-postgres` (`DATABASE_URL`, auth gated by `PAYLOAD_SECRET`). Dev and prod use **distinct databases** so a misconfigured `DATABASE_URL` can't cross over — current names + container topology in `docs/agents/deployment.md`. Throwaway `admin/admin` lives only on the dev DB; never copy to prod.
- **Payments:** Stripe (EUR). Payment Element (cards + Google/Apple Pay). Webhook `POST /api/stripe/webhook` (signature-verified). Keys: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Migrating the account from `korcula-moreska.com` to `moreska.eu` via dual webhook endpoints during transition.
- **Email sending:** Brevo (free tier, 300/day). Sends from `info@moreska.eu` (review/newsletter mail from `newsletter@bilten.moreska.eu`). Key: `BREVO_API_KEY`.
- **Email receiving:** ImprovMX forwards `info@moreska.eu` to a personal inbox (migration to Google Workspace proposed — ADR-0010).
- **Analytics & ad tracking:** GA4 (`NEXT_PUBLIC_GA_ID`) loaded via `next/script` in `src/components/CookieConsent.tsx`, gated on consent. A single umbrella Google tag (`GT-*`) covers both GA4 and Google Ads — fire **one** `gtag('event', 'purchase', …)` on the confirmation page (don't load a second `gtag/js?id=AW-…` script). The `gtag()` helper must push the `arguments` object, not an Array. **Meta tracking:** browser Pixel (loaded in `CookieConsent.tsx`, gated on consent) + **server-side Conversions API Purchase** fired from the Stripe webhook (`src/lib/meta/capi.ts`), deduped by a shared `event_id = order_<orderId>` on both legs (`MetaPixelPurchase.tsx` sets the browser `eventID`). Verified live end-to-end 2026-07. **Paid campaign management (#45, #46) and marketing listings (#35, #36, #39) are owned by a separate HGD member, not the developer** — dev scope stops at tag firing + measurement correctness.
- **Infrastructure:** Hetzner Cloud + Coolify (Nuremberg). SSL automatic via Traefik (set the domain to `https://` in Coolify). See `docs/agents/deployment.md`.
- **DNS:** Hetzner DNS. Domain `moreska.eu` registered at Totohost; nameserver handoff to Hetzner in progress.

### Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/(frontend)/page.tsx` | Homepage (10 sections) |
| `/about` | `src/app/(frontend)/about/page.tsx` | About HGD |
| `/sections/[slug]` | `src/app/(frontend)/sections/[slug]/page.tsx` | Section pages (see slug map below) |
| `/tickets` | `src/app/(frontend)/tickets/page.tsx` | Public show schedule (reads Shows; force-dynamic) |
| `/services/[slug]` | `src/app/(frontend)/services/[slug]/page.tsx` | Service enquiry pages, no pricing |
| `/checkout/[showId]` | `src/app/(frontend)/checkout/[showId]/page.tsx` | Stripe checkout |
| `/checkout/[showId]/confirmation` | `…/confirmation/page.tsx` | Post-payment landing; looks up Order by `pi` (5×400ms retry to bridge the webhook race) |
| `/privacy-policy`, `/cookie-policy` | `src/app/(frontend)/…/page.tsx` | Legal pages (EN+HR), via `LegalPage.tsx` |
| `/scan/[token]` | `src/app/scan/[token]/page.tsx` (+ `scan/layout.tsx`) | Auth-aware door scan — buyer view if unauth, staff atomic mark-and-read if internal. Outside `(frontend)` (own minimal layout). Logic in `src/lib/scan-token.ts`; CSRF caveats in `payload-admin.md` |
| `/admin`, `/admin/stats`, `/admin/stats/[showId]` | Payload + `src/components/payload/AdminStatsView.tsx`, `AdminShowStatsView.tsx` | Admin dashboard + role-aware stats views |
| `/api/stripe/webhook` | `src/app/api/stripe/webhook/route.ts` | Creates Order + Tickets on payment success |

### Key files

| Path | Purpose |
|---|---|
| `src/proxy.ts` | Locale detection (Next.js 16 "proxy" convention) |
| `src/lib/shows.ts` | **Only** server-side entry point for frontend show data: `getUpcomingShows()`, `getNextShow()` (canonical "active door show"); derives `remaining` from `VENUE_CAPACITY` |
| `src/lib/scan-token.ts` | Pure DI logic for `/scan/[token]` → `VALID \| ALREADY_SCANNED \| INVALID`; race-safety delegated to `deps.atomicMarkScanned` (raw `UPDATE tickets … WHERE scanned=false RETURNING …`) |
| `src/lib/access/roles.ts` | Role predicates (`isSuperadmin`, `isAdminTier`, `isAuthed`, `isPartner`, `partnerIdOf`) — source of truth for roles |
| `src/lib/access/partner.ts` | Partner ownership `Where` scoping, shared by collection access + partner routes |
| `src/lib/data.ts` | Locale-agnostic data: performances, history vignettes, section/service card + page meta |
| `src/messages/{en,hr}.json` | All UI strings (identical structure) |
| `src/app/globals.css` | Full design CSS + Tailwind + breakpoints |
| `src/app/(frontend)/layout.tsx` | Root layout for the public site — fonts, `lang`, `CookieConsent` |
| `src/components/*` | `Nav`, `Hero`, `PageHero`, `LegalPage`, `CookieConsent`, `ServiceEnquiryForm`, `Contact` (most are `'use client'`) |
| `docs/` | `copywriting{,-hr}.md`, `design-brief.md`, `performances.md`, `sveta-cecilija.md`, `todo.md` |

### Assets

Production assets live in `public/` (the served set). Key files: `hero-horizontal.webm` / `hero-vertical.webm` (+ matching `*-poster.webp`), `cecilija-logo.webp`. Originals stay in `assets/images/`; the PDF renderer needs the PNG logo at `assets/images/cecilija-logo.png`. **Any photo in `public/` must be optimized webp.** Full conventions + `cwebp` recipe: `docs/agents/assets.md`.

### Payload CMS collections

Field-level detail lives in `src/collections/*.ts` — this table is purpose + key relationships only.

| Collection (slug) | Purpose |
|---|---|
| `Shows` (`shows`) | Show schedule: date/time/venue, sold counters, `status`, bad-weather venue-move audit fields (#94). Capacity derived per venue, never stored. |
| `Orders` (`orders`) | One purchase: buyer + counts + `total` (EUR cents) + `stripePaymentIntentId` + `refundStatus` → Shows. `channel` (`online \| partner \| comp`); `partner` link for reseller scoping; `member` link for comp attribution (ADR-0019); `promoCode` link for online promo orders (ADR-0018, still `channel=online`) |
| `OrderLookups` (`order-lookups`) | Buyer-facing order lookup support |
| `Tickets` (`tickets`) | **Per-person** ticket + QR token → Orders; `scanned`/`scannedAt`. Seats = COUNT of active tickets (`online_sold` retired). Renamed from `qr_tokens`. |
| `ContactSubmissions` (`contact-submissions`) | Enquiry-form submissions |
| `Users` (`users`) | Payload auth + `role` (see `roles.ts`). Hybrid username login (ADR-0011): unique `username`, email optional but required for superadmin/admin. Shared door account is username `tehnika` (no email). `partner` logins carry a `partner` → Partners relationship. |
| `Partners` (`partners`) | Reseller channel (ADR-0008): `name`, `oib`, `commissionPercent`, `active`. Admin-tier CRUD; a partner reads only its own record. |
| `Members` (`members`) | Society members (ADR-0019): `name`, `active`, `note`. Shared attribution target for comp tickets (`orders.member`) and promo codes (`promoCodes.member`). No email/login. Admin-tier CRUD; hidden from tehnika/partner. |
| `PromoCodes` (`promo-codes`) | Member promo codes (ADR-0018): `code` (unique), `member` (→ Members), `discountType` (`adult-price-override`), `adultPriceEur` (default 15), `active`. Applied at online checkout, best-of-two vs 5-for-4. Admin-tier CRUD. |
| `Posts` (`posts`) | Blog posts (heroImage may be a remote URL) |
| `marketing_optouts` | **Raw table, NOT a Payload collection** (#57): `email` PK, `source`, `optedOutAt`. Created in `db/schema/app.sql`; see `docs/agents/features.md`. |

### Role-based access controls

Access is keyed off `user.role` via the predicates in `src/lib/access/roles.ts` (`isAuthed` = internal staff: superadmin/admin/tehnika, **not** partner). Partner ownership scoping lives in `src/lib/access/partner.ts` and is re-derived by partner-facing routes (the local API runs `overrideAccess: true`).

| Collection | read | create/update/delete |
|---|---|---|
| `Orders` | admin-tier; `partner` → only own | admin-tier |
| `ContactSubmissions` | admin-tier | admin-tier |
| `Shows` | authed (for `/scan` + stats) | admin-tier |
| `Tickets` | authed (door scanning); `partner` → only own | admin-tier |
| `Partners` | admin-tier; `partner` → only own | admin-tier |
| `Members` | admin-tier | admin-tier |
| `PromoCodes` | admin-tier | admin-tier |
| `Users` | self-or-superadmin | create/delete superadmin-only; update self-or-superadmin |

`POST /api/orders/[id]/refund` re-checks the role in-handler and 403s otherwise (the local API's `overrideAccess: true` means collection access alone doesn't gate it). The Stripe webhook and frontend show queries use the local API, so collection access doesn't affect them.

### Ticketing rules

- **Prices:** €20 adult, €10 child (fixed).
- **Venue capacities:** `ljetno-kino` (Summer Cinema / Ljetno kino) = 320; `zimsko-kino` (Cultural Center Korčula / Centar za kulturu) = 250. Always derived from `VENUE_CAPACITY` in `src/lib/shows.ts`; remaining = capacity − sold tickets.
- **Public venue names differ from DB values** — EN "Summer Cinema" / "Cultural Center Korčula", HR "Ljetno kino" / "Centar za kulturu". Keys: `schedule.venue*`, `performancesPage.venue*`. Buyer-facing names come from `VENUE_LABEL` in `src/lib/venues.ts`. Venue shown on every show card; a bad-weather note tops the tickets page (zimsko is the fallback).
- **Show types in `docs/performances.md`:** only `Redovna` (public ticketed) shows appear on `/tickets`; `Gulliver` / `Adriatic DMC` (private tour operator) and `Crveni križ` (charity) are scheduling context only, not in the DB.
- **QR codes:** generated server-side at order creation, one per ticket, each encoding `https://moreska.eu/scan/[token]`. Door scanning is the browser-based `/scan/[token]` page only (Pretix dropped from MVP).
- **Comp & promo:** admin-issued free tickets ride `channel='comp'` (`total=0`, `orders.member` attribution, kept out of revenue, capacity-guarded like a partner sell; ADR-0019). Member promo codes apply at online checkout (`adultPriceEur` override, best-of-two vs the automatic 5-for-4, never stacking; server recomputes; ADR-0018) and stay `channel='online'`.
- **Refunds:** admin-initiated only, idempotent and safely re-runnable — the route checks `refundStatus` before calling Stripe, the Stripe call carries a stable `refund:<paymentIntentId>` idempotency key (`src/lib/refund/create-stripe-refund.ts`), and a retry on an already-`refunded` order re-voids any still-active tickets (self-heal). Regression probe: `scripts/probe-refund-void.mjs`.

### CSS architecture

Gotchas (specificity, `backdrop-filter`, hero loading, `next/image`, route-group layouts) live in `docs/agents/frontend-css.md`. The scope map:

- **Theme tokens** in `.t-stone` — `--bg`, `--gold`, `--pad`, `--sectionPadX`, `--maxW` (1480px).
- **Homepage** (`.hp .t-stone`): `.about`, `.opera`, `.hist`, `.secs`, `.svcs`, `.contact--dark`, `.foot--atmos`.
- **Inner pages** (`.inner-page .t-stone`): `.page-hero`, `.ip-*`, `.sp-*`, `.svc-page__*`, `.legal-page__*`, `.vignette`, `.ip-cta`. Don't mix the `.hp` and `.inner-page` scopes.
- **Global:** `.cookie-banner*` (fixed bottom bar, hardcoded colours). **Nav:** `.nav` / `.nav--inner` / `.nav__hamburger` / `.nav__overlay`.
- **Breakpoints:** 1280 → 1024 → 768 → 480px. At 768px the hamburger shows, desktop nav hides, grids collapse. Hero uses `min(940px, 100vh)` — never hardcode a height taller than a laptop viewport.

### Slug mappings

`SECTION_PAGE_META` / `SERVICE_PAGE_META` in `data.ts`:

| Section slug | `sectionKey` | | Service slug | `cardIndex` |
|---|---|---|---|---|
| `moreska` | `moreska` | | `private-moreska` | 0 |
| `wind-orchestra` | `band` | | `moreska-experience` | 1 |
| `klapa` | `klapa` | | | |
| `choir` | `choir` | | | |

`Sections.tsx` has a local `KEY_TO_SLUG` map for building card hrefs.

### Deferred (post-season)

Payload CMS content management; bulk show-cancellation refunds; buyer email CSV export; bulk email to ticket holders per show; SEO `generateMetadata` on all pages; German language support.
