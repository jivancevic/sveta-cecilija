# CLAUDE.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues at https://github.com/jivancevic/sveta-cecilija. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the default five-role label vocabulary. See `docs/agents/triage-labels.md`.

### Schema management

Production schema is applied by `scripts/bootstrap-db.mjs` (runs from both `npm start` and `npm run dev`, before `next start` / `next dev`) using idempotent SQL in `db/schema/*.sql`. Local dev also uses Payload's `push: true` after bootstrap. See `docs/agents/db-bootstrap.md` for how to add a column or collection, and `db/schema/README.md` for the directory's contract. A vitest guardrail (`src/lib/db-schema-safety.test.ts`) fails on any unguarded `UPDATE`/`DELETE`/`TRUNCATE` in `db/schema/*.sql` — added after PR #126 caught one running on every deploy.

**Enum migrations need ordering care AND a file split.** When you change a Payload `select` field's options, the underlying Postgres enum (`enum_<table>_<field>`) must be widened *before* any SQL UPDATE references the new values. Two gotchas stack:

1. **`ALTER TYPE … ADD VALUE` cannot be used within the same transaction that references the new value** — Postgres errors with `unsafe use of new value of enum type`. `IF NOT EXISTS` doesn't help; that's about idempotency, not transaction scoping.
2. **`bootstrap-db.mjs` sends each `.sql` file as a single `client.query(sql)` call** — pg's simple query protocol treats multi-statement strings as one implicit transaction. So `ALTER TYPE ADD VALUE` and a downstream `UPDATE` cannot share a file.

Pattern: split into two files that run alphabetically. `migrate-roles-1-enum.sql` contains only `ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'newvalue';` (one statement per new value, no DO block). `migrate-roles-2-data.sql` contains the `UPDATE` statements. Each runs in its own implicit transaction; the new enum values are visible by the time step 2 runs.

In dev, Payload's `push: true` will subsequently rewrite the enum to match the field config and `ALTER COLUMN … USING <cast>` — the cast fails if any row still holds a value not in the new enum, so always migrate data *first*. See `db/schema/migrate-roles-1-enum.sql` and `migrate-roles-2-data.sql` for the working pattern.

**Defensive WHERE comparisons against removed enum values.** Once Payload's `push:true` rewrites the enum to drop an old label (e.g. `'door-staff'` → `'tehnika'`), any later run of the same data migration crashes with `invalid input value for enum enum_users_role: "door-staff"`. Postgres coerces the RHS literal of `WHERE role = 'door-staff'` to the column's enum type at *parse* time, so the script fails before it can check whether any row still needs migrating. Fix: cast the column to text — `WHERE role::text = 'door-staff'`. The migration stays idempotent on fresh DBs (no rows match, no-op) and still does the right thing on DBs that haven't been re-pushed yet.

**`npm run dev` runs bootstrap-db.mjs**, but only if `DATABASE_URL` is in the shell env. `next dev` itself loads `.env.local`, but standalone node scripts don't. If bootstrap prints `DATABASE_URL is not set — skipping`, source env first: `set -a && . .env.local && set +a && npm run dev`. A fresh clone hitting an enum-change migration will 500 until this is done.

### Env files

`.env.example` (committed) is the template — copy to `.env.local` for dev and fill values. `.gitignore` blocks every `.env*` except the example. Production secrets live only in Coolify env settings, never in any file in this repo. Stripe live keys and BREVO_API_KEY should never appear in chat sessions — if they do, rotate them.

### Atomic DB writes when a field accumulates

When an API endpoint adds-to a numeric column (`inPersonSold`, `onlineSold`, etc.) instead of replacing it, **never** do `find` → compute → `update` — that read-modify-write loses updates under concurrent requests. Use a single SQL statement via the underlying pool:

```ts
const db = (payload.db as unknown as { pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> } }).pool
const res = await db.query(
  'UPDATE shows SET in_person_sold = COALESCE(in_person_sold, 0) + $1, updated_at = NOW() WHERE id = $2 RETURNING in_person_sold',
  [delta, Number(showId)],
)
```

Pattern proven in `src/app/api/shows/[id]/in-person-sales/route.ts`. The lib helper takes an `atomicIncrement` dep so unit tests can mock it; only the route wires the real SQL.

### Deployment (Coolify / Nixpacks)

Coolify on Hetzner builds with Nixpacks, runs `npm ci --production` (= `--omit=dev`), then `npm start` (= bootstrap + `next start`). Three gotchas worth knowing before you touch the build:

1. **Pin Node via `engines` in `package.json`**, not the `NIXPACKS_NODE_VERSION` env var. Nixpacks's pinned nixpkgs revision only goes up to `nodejs_22` — `NIXPACKS_NODE_VERSION=24` fails the nix-env step with `undefined variable 'nodejs_24'`.
2. **Regenerate `package-lock.json` in a Linux container before any merge that touches deps. Hard pre-merge gate, not a tip.** Two distinct failure modes stack:
   - **Platform / npm-version skew.** `npm install` on macOS resolves transitives differently and can omit entries Linux `npm ci` requires. macOS hosts on Node 24+ run npm 11, which considers some nested optional peerDeps removable; Coolify's `node:22` runs npm 10 and still requires them. Symptom on Coolify: Nixpacks fails at the `npm ci` step with `npm error code EUSAGE` and `Missing: <pkg>@<version> from lock file` (e.g. `yaml@2.9.0` from a vitest peerDep).
   - Tests passing locally is *not* a substitute — vitest never runs `npm ci`. `next build` is not a substitute either — it reads `node_modules`, not the lockfile.

   **Recipe**, lockfile-only inside `node:22` (avoids macOS bind-mount choking on `rm -rf node_modules`):

   ```
   rm -f package-lock.json
   docker run --rm -v "$PWD":/app -w /app node:22 \
     sh -c "npm install --package-lock-only --no-audit --no-fund"
   ```

   Then verify in the same image: `docker run --rm -v "$PWD":/app -w /app node:22 sh -c "npm ci --omit=dev --dry-run"` must exit 0.
3. **`overrides` keeps esbuild flat.** `package.json` has `"overrides": { "esbuild": "^0.25.0" }` to collapse vitest's nested esbuild into the root version — without this, Coolify hits `EBADPLATFORM @esbuild/aix-ppc64`. If you bump vitest or add a devDep that brings its own esbuild, re-verify in the container before pushing.

See `docs/agents/deployment.md` for the full debugging playbook + log triage patterns.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at the root points to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.

---

## Project: moreska.eu — HGD Sveta Cecilija

Website for HGD Sveta Cecilija, a 143-year-old cultural organisation from Korčula, Croatia, home of the Moreška sword dance. Public site at `moreska.eu`. Full PRD in GitHub Issues #1.

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
| Date of establishment | 1991 (current Croatian legal entity; the cultural society itself dates to 1883 — use 1991 for any "company founded" registry field) |
| Authorised representative | Velebit Veršić (President) |
| Website (for new forms) | `https://moreska.eu` |

Registry still lists `www.korcula-moreska.com` as the official website — update post-DNS-cutover.

### Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS + custom CSS (`src/app/globals.css`). Homepage scoped under `.hp .t-stone`; inner pages under `.inner-page .t-stone`. Design tokens (colors, spacing) in `.t-stone` CSS custom properties.
- **i18n:** Routes are at the top level (e.g. `/tickets`, `/checkout/[showId]`, `/about`) — locale is **not** in the URL. `src/proxy.ts` reads the `moreska_locale` cookie (or `Accept-Language` on first visit) and forwards it to server components via an `x-locale` request header; pages call `getLocale()` from `src/lib/locale.ts` to read it. Translations in `src/messages/{en,hr}.json`. Helper: `src/lib/i18n.ts` (`getDictionary`). Dictionary type inferred from `en.json` — both locale files must stay structurally identical. **Never build internal URLs with a `/en` or `/hr` prefix** — those routes 404.
- **Fonts:** Bodoni Moda SC, IBM Plex Mono, Inter via `next/font/google`. Bodoni Moda SC (var `--font-bodoni`) for all headlines/titles; IBM Plex Mono for codes/tags; Inter for body.
- **CMS:** Payload CMS v3 (`@payloadcms/next` adapter, integrated directly into Next.js app). Admin at `/admin`.
- **Database:** PostgreSQL via `@payloadcms/db-postgres`. Connection via `DATABASE_URL` env var. Auth gated by `PAYLOAD_SECRET`. **Local dev DB is `sveta_cecilija_dev`, production is `sveta_cecilija`** — distinct names so a misconfigured DATABASE_URL cannot read or write the wrong database. Local seeds + a throwaway admin account (`admin/admin`) live only on `_dev`; never copy that password to prod.
- **Payments:** Stripe (EUR). Payment Element handles cards + Google Pay + Apple Pay. Webhook at `POST /api/stripe/webhook` (verified by signature). Keys: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Existing Stripe account was connected to `korcula-moreska.com` — migrating to `moreska.eu` by running dual webhook endpoints during transition; old endpoint removed after DNS cutover is stable.
- **Email sending:** Brevo (free tier — 300 emails/day, 9k/month). Sends from `info@moreska.eu`. Key: `BREVO_API_KEY`. Domain verified via SPF/DKIM/DMARC records in Hetzner DNS.
- **Email receiving:** ImprovMX — forwards `info@moreska.eu` to personal inbox via MX records in Hetzner DNS. No mailbox to manage.
- **Analytics & ad tracking:** Google Analytics 4 (env: `NEXT_PUBLIC_GA_ID`) is loaded via `next/script` inside `src/components/CookieConsent.tsx`, gated on the user accepting cookies. The Google tag is a single umbrella tag (`GT-*`) shared between GA4 and Google Ads — **one** `gtag('event', 'purchase', { value, currency, transaction_id })` call on `/checkout/[showId]/confirmation` covers both GA4 reporting and the Google Ads conversion (`AW-*`, sourced from GA4 → no separate `send_to` label). Meta Pixel install (env: `NEXT_PUBLIC_META_PIXEL_ID`) tracked in #70; the Ads conversion fire + Google Consent Mode v2 wiring (EEA-required) in #71. Don't load a second `<script src="...gtag/js?id=AW-...">` — that conflicts with the GA4 one. **Paid campaign management (Meta retargeting #45, Google Ads #46) and marketing listings (GBP #36, TripAdvisor #35, OTAs #39) are owned by a separate HGD member, not the developer.** Dev scope stops at tag firing + measurement correctness.
- **Infrastructure:** Hetzner Cloud server (CX32 or Cost-Optimized equivalent, Nuremberg) + Coolify for deployment. SSL is automatic via Traefik — no separate toggle; just set domain to `https://` in Coolify and Traefik provisions Let's Encrypt on first request after DNS propagates. Setup guide in `docs/todo.md`.
- **DNS:** Hetzner DNS (`dns.hetzner.com`). Nameservers: `hydrogen/oxygen/helium.ns.hetzner.com`. Domain `moreska.eu` registered at Totohost — nameserver change requested from them to hand off DNS control to Hetzner.

### Pages

| Route | File | Notes |
|---|---|---|
| `/` | `src/app/(frontend)/page.tsx` | Homepage — 10 sections |
| `/about` | `src/app/(frontend)/about/page.tsx` | About HGD — PageHero + intro + 8-vignette history + ensemble cards + CTA |
| `/sections/[slug]` | `src/app/(frontend)/sections/[slug]/page.tsx` | Section pages (moreska, wind-orchestra, klapa, choir) |
| `/tickets` | `src/app/(frontend)/tickets/page.tsx` | Public show schedule — reads from Shows collection; hides cancelled/sold-out |
| `/services/[slug]` | `src/app/(frontend)/services/[slug]/page.tsx` | Service pages (private-moreska, moreska-experience) — enquiry form only, no pricing |
| `/checkout/[showId]` | `src/app/(frontend)/checkout/[showId]/page.tsx` | Stripe checkout — order summary, buyer form, Stripe Payment Element |
| `/checkout/[showId]/confirmation` | `src/app/(frontend)/checkout/[showId]/confirmation/page.tsx` | Post-payment landing page — looks up the Order by `pi` query param (5×400ms retry to bridge the webhook race) |
| `/privacy-policy` | `src/app/(frontend)/privacy-policy/page.tsx` | Privacy Policy — GDPR-compliant, 5 sections, EN + HR |
| `/cookie-policy` | `src/app/(frontend)/cookie-policy/page.tsx` | Cookie Policy — 5 sections, EN + HR |
| `/scan/[token]` | `src/app/scan/[token]/page.tsx` (+ `src/app/scan/layout.tsx`) | Auth-aware door scan. Unauthenticated (buyer tapping QR from email) → buyer ticket view with on-page QR + "do not tap again" notice, no DB write. Authenticated `admin` / `door-staff` → atomic mark-and-read, renders VALID / ALREADY_SCANNED / INVALID. On ALREADY_SCANNED, authed users see an "Undo scan" link for 2 minutes after the original scan (server-enforced, not client-trust). Race-safe. Mobile-optimised. Lives outside `(frontend)` so it has its own minimal root layout (no fonts/CookieConsent). |
| `/admin` | Payload CMS built-in | Admin dashboard — show management, orders, in-person sales, refunds |
| `/admin/stats` | `src/components/payload/AdminStatsView.tsx` | Custom admin view — season aggregate header (tickets sold, scanned, revenue, by-venue split) + show table (upcoming + today + last 7 days). Force-dynamic. Visible to `admin` and `door-staff`. Mobile-friendly. |
| `/admin/stats/[showId]` | `src/components/payload/AdminShowStatsView.tsx` | Per-show drill-down. Role-aware: `door-staff` sees numbers only (online/in-person sold, scanned, remaining, revenue); `admin` also sees the full order list with buyer PII and per-QR scan state. |
| `/api/stripe/webhook` | `src/app/api/stripe/webhook/route.ts` | Stripe webhook — creates Order + QRTokens on payment success |

### Key files

| Path | Purpose |
|---|---|
| `src/proxy.ts` | Locale detection & redirect (Next.js 16 "proxy" convention) |
| `src/lib/shows.ts` | **Only server-side entry point for frontend show data.** `getUpcomingShows(limit?)` queries Payload and returns `Show[]` with `remaining` derived from `VENUE_CAPACITY[venue]`. Never query the Shows collection directly in page components. |
| `src/lib/scan-token.ts` | Pure DI logic for `/scan/[token]`. `scanToken(token, deps)` returns discriminated union `VALID \| ALREADY_SCANNED \| INVALID`. Race-safety is delegated to `deps.atomicMarkScanned` — the page wires it to a raw `UPDATE qr_tokens SET scanned=true WHERE token=$1 AND scanned=false RETURNING ...` via Payload's drizzle. |
| `src/messages/en.json` | All English strings — nav, hero, about, schedule, history, sections, services, contact, footer, `aboutPage`, `sectionPages`, `servicePages`, `cookieBanner`, `privacyPage`, `cookiePage`, `performancesPage` |
| `src/messages/hr.json` | All Croatian strings — identical structure to en.json |
| `src/lib/data.ts` | Locale-agnostic data: 24 performances, `HISTORY_VIGNETTES_META` (8), `HISTORY_VIGNETTES_HOME` (4 for homepage), `SECTION_CARDS_META`, `SERVICE_CARDS_META`, `SECTION_PAGE_META` (slug→image+sectionKey), `SERVICE_PAGE_META` (slug→image+cardIndex) |
| `src/app/globals.css` | Full design CSS + Tailwind + responsive breakpoints |
| `src/app/[locale]/layout.tsx` | Root layout — loads fonts, sets `lang`, renders `CookieConsent` |
| `src/app/[locale]/page.tsx` | Homepage — composes all section components |
| `src/components/Nav.tsx` | `'use client'` — hamburger + full-screen overlay; `variant` prop: `'homepage'` (position:absolute) or `'inner'` (sticky dark bg) |
| `src/components/Hero.tsx` | `'use client'` — swaps video src (horizontal/vertical) based on viewport width; sets matching `poster` attribute; hero animations, grey wash, logo, CTAs |
| `src/components/PageHero.tsx` | Shared hero for inner pages (image + gradient overlay + h1 + subtitle) |
| `src/components/LegalPage.tsx` | Shared layout for Privacy Policy + Cookie Policy — takes `page` prop from dict |
| `src/components/CookieConsent.tsx` | `'use client'` — slides up on first visit; `localStorage` key `moreska_cookie_consent` ('accepted'/'declined'); injects GA on accept (gated on `NEXT_PUBLIC_GA_ID`) |
| `src/components/ServiceEnquiryForm.tsx` | `'use client'` — enquiry form with pre-selected enquiry type; local success state |
| `src/components/Contact.tsx` | `'use client'` — form state |
| `Sveta Cecilija/` | Original Claude Design export (reference only — do not edit) |
| `docs/copywriting.md` | English copy for all sections |
| `docs/copywriting-hr.md` | Croatian copy for all sections |
| `docs/design-brief.md` | Visual design brief |
| `docs/performances.md` | 2026 season performance schedule (CSV-style source data) |
| `docs/sveta-cecilija.md` | Organisation background |
| `docs/todo.md` | Non-development TODOs: Stripe registration, Resend setup, DO Droplet + Coolify step-by-step guide, DNS config |

### Assets

All production assets live in `public/`. Key files:
- `hero-horizontal.webm` — autoplay hero video (desktop, ≥768px)
- `hero-vertical.webm` — autoplay hero video (mobile, <768px) — loaded dynamically in `Hero.tsx`
- `hero-horizontal-poster.webp` — first-frame poster for horizontal video (63 KB, extracted at frame 0 to match video start — seamless swap)
- `hero-vertical-poster.webp` — first-frame poster for vertical video (34 KB, extracted at frame 0 to match video start — seamless swap)
- `cecilija-logo.webp` — organisation logo used in Nav, Footer, Hero, and the Organization JSON-LD `logo` field in `src/app/(frontend)/layout.tsx`

Everything in `public/` is referenced from `src/` — `public/` is the served set, not an archive. Originals and B-roll live in `assets/images/` (gitignored deploy-side: only `public/` ships to the browser; `assets/` is read-only source kept in the repo for future use). Off-pipeline keepers go in `assets/images/archived/`; fonts not loaded by the app go in `assets/fonts/`. Don't dump candidates into `public/` — they bloat the Coolify build and the deploy without being served.

**Any photo added to `public/` must be `.webp` and optimized.** Keep the original (jpeg/png/etc.) in `assets/images/`; convert to webp for `public/`. Convention: `cwebp -q 82`, resized to the largest dimension the layout actually needs (`-resize <maxWidth> 0` for full-bleed heroes, smaller for cards/thumbnails) — never ship a 4000px original at full res. Keep file size reasonable: full-bleed hero photos should land in the ~150–550 KB range seen in `public/` today; cards/decorative images well under that. Check the result with `ls -la` + `identify` before committing, and re-encode at lower quality or smaller dimensions if it's an outlier.

The PNG variant of the logo lives at **`assets/images/cecilija-logo.png`** (outside `public/`) — used by `@react-pdf/renderer` in `src/lib/email/render-tickets-pdf.tsx`, which can't decode webp. Read via `fs.readFileSync` at module load, embedded as a `<Image>` in the PDF. Don't move it without updating the renderer.

### CSS architecture

- **Theme tokens** live in `.t-stone` — `--bg`, `--gold`, `--pad` (section vertical padding), `--sectionPadX` (horizontal padding), `--maxW` (1480px max-width).
- **Homepage sections** (`.hp .t-stone`): `.about`, `.opera`, `.hist`, `.secs`, `.svcs`, `.contact--dark`, `.foot--atmos`
- **Inner pages** (`.inner-page .t-stone`): `.page-hero`, `.ip-*` (section layout primitives), `.sp-*` (section page editorial), `.svc-page__*` (service detail pages), `.legal-page__*` (Privacy/Cookie Policy), `.vignette` (history cards — shared), `.ip-cta` (CTA band)
- **Global (body level):** `.cookie-banner` / `.cookie-banner--visible` — fixed bottom bar, outside any page scope; uses hardcoded colours (no `.t-stone` vars available)
- **Nav:** `.nav` / `.nav--inner` / `.nav__hamburger` / `.nav__overlay` + overlay children
- **Responsive breakpoints:** `max-width: 1280px` → `1024px` → `768px` → `480px`. At 768px: hamburger shown, desktop nav links hidden, grids collapse. Hero uses `min(940px, 100vh)` so it always fits the viewport — never hardcode a px height taller than a laptop viewport (~800px).
- **Mobile performances (≤768px):** 2×2 grid, photos hidden, compact tiles — large day number + title + tickets link only.
- **Mobile sections block (≤768px):** All 4 cards stacked vertically. Moreška (`card--feature`) at 420px min-height; others at 200px.
- All `<img>` in the public site use `next/image` (`<Image>`) for responsive srcset + AVIF/webp content negotiation + lazy loading. Two patterns: small fixed assets (logos, decorative SVG-like webps) use explicit `width`/`height`; full-bleed photos that fill a positioned parent use `fill` with an explicit `sizes` matching the layout breakpoints. Above-fold images (Hero logo, Nav logo, PageHero bg) carry `priority`. Exceptions: `src/lib/email/render-tickets-pdf.tsx` uses `@react-pdf/renderer`'s `<Image>` (not next/image); `src/app/(frontend)/blog/page.tsx` keeps a plain `<img>` because `post.heroImage` may be a remote URL (Posts collection allows it) and `next.config.ts` has no `images.remotePatterns` allowlist.

### Section page slugs → sectionKey mapping

Defined in `SECTION_PAGE_META` in `data.ts`:

| URL slug | `sectionKey` | Translation key in `sectionPages` |
|---|---|---|
| `moreska` | `moreska` | `sectionPages.moreska` |
| `wind-orchestra` | `band` | `sectionPages.band` |
| `klapa` | `klapa` | `sectionPages.klapa` |
| `choir` | `choir` | `sectionPages.choir` |

`Sections.tsx` also has a local `KEY_TO_SLUG` map (sectionKey → slug) for building card hrefs.

### Service page slugs → cardIndex mapping

Defined in `SERVICE_PAGE_META` in `data.ts`:

| URL slug | `cardIndex` | Content source |
|---|---|---|
| `private-moreska` | 0 | `services.cards[0]` in translation files |
| `moreska-experience` | 1 | `services.cards[1]` in translation files |

### Payload CMS collections

| Collection | Key fields |
|---|---|
| `Shows` | `date` (DateTime), `time` (text, HH:MM validated), `venue` (select: `ljetno-kino` \| `zimsko-kino`), `onlineSold` (number), `inPersonSold` (number), `status` (active \| cancelled) |
| `Orders` | `buyerName`, `email`, `adultCount`, `childCount`, `total` (EUR cents), `stripePaymentIntentId`, `refundStatus` (none \| refunded), `show` → Shows |
| `QRTokens` | `token` (unique, URL-safe), `order` → Orders, `scanned` (bool), `scannedAt` (DateTime) |
| `ContactSubmissions` | `name`, `email`, `enquiryType`, `message`, `createdAt` |
| `Users` | Payload auth + `role` (select: `superadmin` \| `admin` \| `tehnika` \| `partner`, default `admin`, required — read `src/lib/access/roles.ts`, not this stale enum). `partner` logins carry a `partner` relationship → Partners (read-open so it rides on `req.user` for scoping; write locked to admin-tier so a partner can't repoint itself). Shared `tehnika@moreska.eu` user created manually via /admin — credentials in Coolify/password manager, never in repo. |
| `Partners` | Reseller channel (ADR-0008, #143). `name`, `oib`, `billingAddress`, `commissionPercent` (number, default 10), `active` (bool, default true), `users` (join → users.partner, read-only). Admin-tier CRUD; a `partner` login reads only its own record. |

### Role-based access controls

Collection access is keyed off `user.role` via predicates in `src/lib/access/roles.ts`: `isSuperadmin`, `isAdminTier` (superadmin OR admin), `isAuthed` (any internal staff — superadmin/admin/tehnika, **not** partner), `isPartner`, and `partnerIdOf`. Partner ownership scoping (the `Where` clauses below) lives in `src/lib/access/partner.ts` and is shared by collection `access.read` and any partner-facing route (routes must re-derive it because the local API runs `overrideAccess: true`).

| Collection | read | create/update/delete |
|---|---|---|
| `Orders` | admin-tier; `partner` → only own (`orders.partner = self`) | admin-tier |
| `ContactSubmissions` | admin-tier | admin-tier |
| `Shows` | authed (admin-tier + tehnika — needs read for `/scan` + stats) | admin-tier |
| `Tickets` | authed (full set, for door scanning); `partner` → only own (`tickets.order.partner = self`) | admin-tier |
| `Partners` | admin-tier; `partner` → only own (`partners.id = self`) | admin-tier |
| `Users` | self-or-superadmin | create+delete superadmin-only; update self-or-superadmin |

The refund route `POST /api/orders/[id]/refund` re-checks `isAdmin(user)` and returns 403 otherwise. Payload's local API runs with `overrideAccess: true`, so collection-level `access.update` does not gate it on its own — any admin-only mutation route must re-check in the handler. The Stripe webhook and frontend show queries use the local API, so collection access does not affect them.

Remaining capacity per show = `VENUE_CAPACITY[venue] - onlineSold - inPersonSold` (derived in `src/lib/shows.ts`). **There is no `capacity` field on Shows — never add one.** Capacity is fixed per venue, not per show.

### Ticketing rules

- **Ticket prices:** €20 adult, €10 child (fixed — no dynamic pricing)
- **Venue capacities:** `ljetno-kino` (Summer Cinema / Ljetno kino) = 320 seats; `zimsko-kino` (Cultural Center Korčula / Centar za kulturu) = 250 seats. No per-show overrides — capacity is always derived from `VENUE_CAPACITY` in `src/lib/shows.ts`.
- **Venue public names differ from DB values:** EN: "Summer Cinema" / "Cultural Center Korčula". HR: "Ljetno kino" / "Centar za kulturu". Translation keys: `schedule.venueLjetno`, `schedule.venueZimsko`, `performancesPage.venueLjetno`, `performancesPage.venueZimsko`.
- **Venue shown on every show card** (both homepage `Schedule` and `/tickets` `PerformancesPage`). A bad-weather note appears at the top of the tickets page explaining that zimsko-kino is the fallback venue.
- **Show types in `docs/performances.md`:** `Redovna` = public ticketed shows. `Gulliver` / `Adriatic DMC` = private tour operator (pre-booked, not publicly ticketed). `Crveni križ` = charity. Only `Redovna` shows appear on the public performances page.
- **QR codes:** generated server-side at order creation, one per ticket. Each encodes `https://moreska.eu/scan/[token]`. Embedded as inline base64 in the Resend email.
- **Pretix:** dropped from MVP. Door scanning uses the browser-based `/scan/[token]` page only — staff scan with any phone camera.
- **Refunds:** admin-initiated only (no self-service). Idempotent and safely re-runnable: the route checks `refundStatus` before calling Stripe, the Stripe call carries a stable `refund:<paymentIntentId>` idempotency key (`src/lib/refund/create-stripe-refund.ts`), and a retry on an already-`refunded` order re-voids any still-active tickets (self-heal, no Stripe call, no re-email). Seat-freeing regression probe: `scripts/probe-refund-void.mjs` (transaction-rollback, safe against any DB).

### Payload CMS admin customization (v3.84)

**Component references must always be string paths** — never direct React imports. Every component slot in `buildConfig` and collection configs (`PayloadComponent` type) takes `'@/path/to/File#ExportName'`. Direct imports (e.g. `Component: CollectionCards`) fail TypeScript.

**Admin component placement map** (non-obvious nesting):
- Custom root admin route (`/admin/my-page`): `admin.components.views[key]` in `buildConfig`, with `path: '/my-page'`
- **Replace the `/admin` dashboard itself**: `admin.components.views.dashboard.Component` (no `path`). `admin.dashboard.widgets` is *additive* — it appends widgets to the built-in `CollectionCards`, not a replacement. If you want the dashboard to be your component only, use the dashboard view override.
- Button in collection list header: `collection.admin.components.views.list.actions`
- Item in edit view 3-dot menu: `collection.admin.components.edit.editMenuItems`
- Hide a collection from the sidebar (per-role): `collection.admin.hidden: ({ user }) => !isAdminTier(user)`. Hidden collections also return 404 on direct URL access, not just sidebar omission.
- Field-level access (e.g. lock a role/permission field against self-promotion): `field.access: { read, update, create }`. Each takes a function of `{ req }`. The field is silently dropped from updates if the predicate returns false — no error to the caller.
- **No per-row list actions exist in v3** — cancel/single-doc actions belong in the edit view

**`importMap.js` is manually maintained.** `src/app/(payload)/admin/importMap.js` is not auto-generated. Every new component added to `payload.config.ts` or a collection config must also be imported and keyed there. Omitting it causes a silent render failure.

Two tied-together gotchas you must keep in place or every custom admin component (Logo, Icon, edit-menu items) silently renders nothing:

1. **`admin.importMap.autoGenerate: false`** in `payload.config.ts`. Without this, Payload runs its own `generateImportMap` on every reload — it rewrites `importMap.js` *after* `layout.tsx` and `page.tsx` have already imported it, so the in-memory `importMap` reference stays empty `{}`. Symptom: `getFromImportMap: PayloadComponent not found in importMap` for keys that are literally present in the source file.

2. **`src/app/(payload)/admin/[[...segments]]/not-found.tsx` must import the real `importMap`**, not a local `const importMap: ImportMap = {}`. The Payload starter ships with the empty placeholder; the not-found route is rendered for any unmatched admin URL and shares lookup paths with siblings, so an empty map there leaks back into the edit-view document renders. Replace with `import { importMap } from '../importMap'`.

**`MetaConfig` valid keys** — only `titleSuffix` and `defaultOGImageType` are Payload additions on top of Next.js `Metadata`. There is no `favicon` property.

**Auth in custom API routes** — use `payload.auth({ headers: req.headers })` to verify the admin session before calling `payload.create` / `payload.find` / etc.

**Payload cookie auth has a CSRF gate.** Payload pushes `serverURL` into its `csrf` allowlist during sanitization. When extracting the `payload-token` cookie, it accepts the request only if `Origin` matches an allowlisted entry, or (no Origin) `Sec-Fetch-Site` is `none` / `same-origin` / `same-site`. Two consequences:

1. **Locally**, `NEXT_PUBLIC_BASE_URL` must match the actual port `next dev` runs on. If they diverge (e.g. `.env.local` says `:3000` but `PORT=3456`), every cookie-authenticated request — including `payload.auth({ headers })` inside server components like `/scan/[token]` — silently returns `user: null` and you get the unauthenticated branch. The `Authorization: JWT` header bypasses this check, which is why `/api/users/me` curls work with header auth but not Cookie auth.
2. **In production**, real phone camera scans of QR codes navigate to `https://moreska.eu/scan/[token]` with `Sec-Fetch-Site: none` and no Origin → cookie accepted. Address-bar typing and in-app `/admin` links also work (`none` / `same-origin`). Cross-site initiations (clicking the URL from Slack, Gmail, etc.) get `cross-site` → cookie rejected → page renders the buyer view and the token is never marked scanned. Staff must navigate from within `moreska.eu` for the staff path to trigger.

### Design decisions

- **Shows data is live:** Homepage and `/tickets` page both read from the Shows collection via `getUpcomingShows()` in `src/lib/shows.ts`. Both pages use `export const dynamic = 'force-dynamic'` — required for fresh capacity data on every request. Any page that displays remaining seats must be force-dynamic.
- **`SCHEDULE_ALL` in `data.ts` can be removed** — it is no longer used now that the Shows collection is the source of truth.
- Contact form shows a **local success state** on submit — Resend email sending comes in a later issue.
- Homepage history section uses 4 vignettes (`HISTORY_VIGNETTES_HOME`); About page uses all 8 (`HISTORY_VIGNETTES_META`).
- Nav hamburger overlay replaces desktop links below 768px breakpoint.
- **Hero loading:** No JS loading screen. The `<video>` element uses a `poster` attribute (`/hero-horizontal-poster.webp` or `/hero-vertical-poster.webp`) so the first frame is visible from the initial paint. The video plays underneath as soon as it's buffered. If the poster images are ever re-extracted, extract frame 0 (`ffmpeg -i hero-*.webm -vf "select=eq(n\,0)" -vframes 1 out.png`) so the static poster matches the video's first frame exactly — otherwise the swap from poster to video shows a visible "jump". Convert via `cwebp -q 82`.
- Hero animation sequence: overlays fade in immediately (0s, 0.8s duration). At 0.3s: logo image fades in. At 0.6s: name rises. At 1.0s: est line rises. CTAs are fully visible from load (no animation). Videos are pre-trimmed to start at an interesting frame.
- **`backdrop-filter` pitfall:** Never put `backdrop-filter` on an element that starts at `opacity: 0`. Browsers (especially Safari) apply the filter regardless of opacity, leaking the effect before the animation starts. Use background overlays only for elements that animate in from invisible.
- i18n routing structure is in place from day one — adding new locales requires only a new `src/messages/{locale}.json` and updating `locales` in `src/proxy.ts`.
- **Nav/footer naming:** "Performances" is labelled **"Tickets"** (EN) / **"Ulaznice"** (HR). "Services" is labelled **"Experience"** (EN) / **"Iskustvo"** (HR). The translation keys remain `nav.performances` and `nav.services` — only the string values changed.
- **`.hp a { color: inherit }` specificity pitfall:** This rule (specificity 11) beats `.btn--primary { color: #fff }` (specificity 10), making button text dark on light cards. Fixed with `.hp .btn--primary { color: #fff }` (specificity 20). Apply the same pattern for any new coloured button inside `.hp`.
- **Components requiring `locale` prop for link building:** `Nav`, `Footer`, `Sections`, `Services`, `About`, `Schedule`. Always pass `locale` when composing these.
- **Environments + branching ([ADR-0007](./docs/adr/0007-staging-environment-on-coolify.md)):** single trunk on `main`. Two Coolify apps on the same Hetzner box both track `main`. `dev.moreska.eu` auto-deploys every push to `main` (synthetic DB `sveta_cecilija_staging`, Stripe test keys, Brevo with `DEV_EMAIL_OVERRIDE` rewriting all `to:` addresses, `noindex` + DEV banner, Traefik HTTP Basic Auth on `/admin/*` only). `moreska.eu` has Coolify auto-deploy *off* — promotion is a manual "Redeploy" click in the Coolify UI after testing the same commit on dev. Hotfixes are just "merge to main, immediately Redeploy prod"; no special path. **No `dev` git branch** — the stale `origin/dev` should be deleted. **Don't use Vercel** — the legacy project was deleted; Payload's long-lived Postgres pool + bootstrap-on-start fights serverless.
- **Background session isolation:** `.claude/settings.json` has `"worktree": { "bgIsolation": "worktree" }` — background Claude sessions run in isolated git worktrees by default.
- **Running the app inside a worktree** needs three setup steps beyond `EnterWorktree`: (1) `cp ../../../.env.local .env.local` — three levels up from `.claude/worktrees/<name>/` — because git worktrees only share *tracked* files and `.env.local` is gitignored; without it, `src/payload.config.ts` fail-fasts on `PAYLOAD_SECRET`. (2) `npm install --include=dev --no-audit --no-fund` inside the worktree — the host `node_modules` is `--production`, so symlinking it leaves `@tailwindcss/postcss` and transitives like `enhanced-resolve` missing and every public page 500s on a postcss require. The install also mutates `package-lock.json`; revert it before any commit (`git checkout -- package-lock.json`) since unintended lockfile changes are a hard pre-merge gate. (3) After the install, `rm -rf .next` — turbopack caches the earlier "module not found" resolution failures and keeps serving 500s even once the missing module is on disk. If `bootstrap-db.mjs` itself fails on a stale enum and you only need to verify rendering, bypass it: `set -a && . "$(pwd)/.env.local" && set +a && PORT=<port> node_modules/.bin/next dev`.
- **Route groups own their root layout.** `src/app/(frontend)/layout.tsx` provides `<html>`/`<body>` for everything inside `(frontend)`. Any page placed OUTSIDE a route group (e.g. `src/app/scan/[token]/page.tsx`) needs its own sibling `layout.tsx` with html/body, or Next.js throws "Missing `<html>` and `<body>` tags". Keep utility-page layouts minimal — don't pull in fonts/CookieConsent that the public site needs.
- **Raw SQL for race-sensitive ops:** Payload's `find`/`update` are read-then-write under the hood and not safe for "first-one-wins" semantics. For atomic mark-and-read (e.g. ticket scan), drop to drizzle: `const drizzle: any = (payload.db as any).drizzle` then `drizzle.execute(sql\`UPDATE ... WHERE cond=false RETURNING ...\`)` with `sql` imported from `@payloadcms/db-postgres`. Result rows live on `res.rows`. Verified race-safe end-to-end: 20 concurrent identical scans → exactly 1 VALID.
- **Security headers + fail-fast secrets:** `next.config.ts` sets HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and disables `x-powered-by` for every response. `src/payload.config.ts` throws on missing `PAYLOAD_SECRET` instead of silently defaulting to `''` (which would mint forgeable JWTs). Don't relax either — it's the baseline that lets buyer-side `/scan/[token]` be safely public.

### MVP issues

All MVP build issues (#2–#10, #20–#25) are shipped. The only thing left before cutover is **[#11 — Cutover: smoke test + DNS switch from WordPress](https://github.com/jivancevic/sveta-cecilija/issues/11)** (HITL). For current open work, run `gh issue list --state open`.

Target: cutover from `korcula-moreska.com` to `moreska.eu` before peak season (end of June 2026).

### Deferred (post-season)

- Payload CMS content management (About, section pages, Privacy Policy)
- Bulk show-cancellation refunds
- Buyer email CSV export
- Bulk email to ticket holders per show
- SEO metadata (`generateMetadata`) on all pages
- German language support
