# CLAUDE.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues at https://github.com/jivancevic/sveta-cecilija. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the default five-role label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `CONTEXT-MAP.md` at the root points to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.

---

## Project: moreska.eu — HGD Sveta Cecilija

Website for HGD Sveta Cecilija, a 143-year-old cultural organisation from Korčula, Croatia, home of the Moreška sword dance. Public site at `moreska.eu`. Full PRD in GitHub Issues #1.

### Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS + custom CSS (`src/app/globals.css`). Homepage scoped under `.hp .t-stone`; inner pages under `.inner-page .t-stone`. Design tokens (colors, spacing) in `.t-stone` CSS custom properties.
- **i18n:** Manual `[locale]` routing (`/en`, `/hr`). Proxy in `src/proxy.ts`. Translations in `src/messages/{en,hr}.json`. Helper: `src/lib/i18n.ts` (`getDictionary`). Dictionary type inferred from `en.json` — both locale files must stay structurally identical.
- **Fonts:** Bodoni Moda SC, IBM Plex Mono, Inter via `next/font/google`. Bodoni Moda SC (var `--font-bodoni`) for all headlines/titles; IBM Plex Mono for codes/tags; Inter for body.
- **CMS:** Payload CMS v3 (`@payloadcms/next` adapter, integrated directly into Next.js app). Admin at `/admin`.
- **Database:** PostgreSQL via `@payloadcms/db-postgres`. Connection via `DATABASE_URL` env var. Auth gated by `PAYLOAD_SECRET`.
- **Payments:** Stripe (EUR). Payment Element handles cards + Google Pay + Apple Pay. Webhook at `POST /api/stripe/webhook` (verified by signature). Keys: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Email:** Resend, sending from `info@moreska.eu`. Key: `RESEND_API_KEY`.
- **Infrastructure:** DigitalOcean Droplet (4 GB RAM, Frankfurt) + Coolify for deployment + Let's Encrypt SSL. Setup guide in `docs/todo.md`.

### Pages

| Route | File | Notes |
|---|---|---|
| `/[locale]` | `src/app/[locale]/page.tsx` | Homepage — 10 sections |
| `/[locale]/about` | `src/app/[locale]/about/page.tsx` | About HGD — PageHero + intro + 8-vignette history + ensemble cards + CTA |
| `/[locale]/sections/[slug]` | `src/app/[locale]/sections/[slug]/page.tsx` | Section pages (moreska, wind-orchestra, klapa, choir) |
| `/[locale]/tickets` | `src/app/[locale]/tickets/page.tsx` | Public show schedule — reads from Shows collection; hides cancelled/sold-out |
| `/[locale]/services/[slug]` | `src/app/[locale]/services/[slug]/page.tsx` | Service pages (private-moreska, moreska-experience) — enquiry form only, no pricing |
| `/[locale]/privacy-policy` | `src/app/[locale]/privacy-policy/page.tsx` | Privacy Policy — GDPR-compliant, 5 sections, EN + HR |
| `/[locale]/cookie-policy` | `src/app/[locale]/cookie-policy/page.tsx` | Cookie Policy — 5 sections, EN + HR |
| `/scan/[token]` | `src/app/scan/[token]/page.tsx` | Door scan result — VALID / ALREADY_SCANNED / INVALID. Race-safe. Mobile-optimised. |
| `/admin` | Payload CMS built-in | Admin dashboard — show management, orders, in-person sales, refunds |
| `/api/stripe/webhook` | `src/app/api/stripe/webhook/route.ts` | Stripe webhook — creates Order + QRTokens on payment success |

### Key files

| Path | Purpose |
|---|---|
| `src/proxy.ts` | Locale detection & redirect (Next.js 16 "proxy" convention) |
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
- `hero-horizontal-poster.webp` — first-frame poster for horizontal video (74 KB, extracted at 0.5s)
- `hero-vertical-poster.webp` — first-frame poster for vertical video (41 KB, extracted at 0.5s)
- `cecilija-logo.png` — organisation logo used in Nav, Footer, Hero
- `Vinque-Rg.otf` — custom serif font

### CSS architecture

- **Theme tokens** live in `.t-stone` — `--bg`, `--gold`, `--pad` (section vertical padding), `--sectionPadX` (horizontal padding), `--maxW` (1480px max-width).
- **Homepage sections** (`.hp .t-stone`): `.about`, `.opera`, `.hist`, `.secs`, `.svcs`, `.contact--dark`, `.foot--atmos`
- **Inner pages** (`.inner-page .t-stone`): `.page-hero`, `.ip-*` (section layout primitives), `.sp-*` (section page editorial), `.svc-page__*` (service detail pages), `.legal-page__*` (Privacy/Cookie Policy), `.vignette` (history cards — shared), `.ip-cta` (CTA band)
- **Global (body level):** `.cookie-banner` / `.cookie-banner--visible` — fixed bottom bar, outside any page scope; uses hardcoded colours (no `.t-stone` vars available)
- **Nav:** `.nav` / `.nav--inner` / `.nav__hamburger` / `.nav__overlay` + overlay children
- **Responsive breakpoints:** `max-width: 1280px` → `1024px` → `768px` → `480px`. At 768px: hamburger shown, desktop nav links hidden, grids collapse. Hero uses `min(940px, 100vh)` so it always fits the viewport — never hardcode a px height taller than a laptop viewport (~800px).
- **Mobile performances (≤768px):** 2×2 grid, photos hidden, compact tiles — large day number + title + tickets link only.
- **Mobile sections block (≤768px):** All 4 cards stacked vertically. Moreška (`card--feature`) at 420px min-height; others at 200px.
- No `next/image` — plain `<img>` throughout. Migrate to `next/image` in a later optimisation pass.

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
| `Shows` | `date` (DateTime), `time` (text), `capacity` (number), `onlineSold` (number), `inPersonSold` (number), `status` (active \| cancelled) |
| `Orders` | `buyerName`, `email`, `adultCount`, `childCount`, `total` (EUR cents), `stripePaymentIntentId`, `refundStatus` (none \| refunded), `show` → Shows |
| `QRTokens` | `token` (unique, URL-safe), `order` → Orders, `scanned` (bool), `scannedAt` (DateTime) |
| `ContactSubmissions` | `name`, `email`, `enquiryType`, `message`, `createdAt` |

Remaining capacity per show = `capacity - onlineSold - inPersonSold`.

### Ticketing rules

- **Ticket prices:** €20 adult, €10 child (fixed — no dynamic pricing)
- **Venue capacity:** 250 per show
- **Show types in `docs/performances.md`:** `Redovna` = public ticketed shows. `Gulliver` / `Adriatic DMC` = private tour operator (pre-booked, not publicly ticketed). `Crveni križ` = charity. Only `Redovna` shows appear on the public performances page.
- **QR codes:** generated server-side at order creation, one per ticket. Each encodes `https://moreska.eu/scan/[token]`. Embedded as inline base64 in the Resend email.
- **Pretix:** dropped from MVP. Door scanning uses the browser-based `/scan/[token]` page only — staff scan with any phone camera.
- **Refunds:** admin-initiated only (no self-service). Idempotent — check `refundStatus` before calling Stripe to prevent double-refunds.

### Design decisions

- **Content migration in progress:** `src/lib/data.ts` hardcoded schedule is being replaced by the Shows collection. Homepage shows 4 next upcoming active shows from the DB. Once complete, `SCHEDULE_ALL` in `data.ts` can be removed.
- Contact form shows a **local success state** on submit — Resend email sending comes in a later issue.
- Homepage history section uses 4 vignettes (`HISTORY_VIGNETTES_HOME`); About page uses all 8 (`HISTORY_VIGNETTES_META`).
- No `next/image` — plain `<img>` throughout. Migrate in a later optimisation pass.
- Nav hamburger overlay replaces desktop links below 768px breakpoint.
- **Hero loading:** No JS loading screen. The `<video>` element uses a `poster` attribute (`/hero-horizontal-poster.webp` or `/hero-vertical-poster.webp`) so the first frame is visible from the initial paint. The video plays underneath as soon as it's buffered. If the poster images are ever re-extracted, use `ffmpeg` at `0.5s` and convert via `cwebp -q 82`.
- Hero animation sequence: overlays fade in immediately (0s, 0.8s duration). At 0.3s: logo image fades in. At 0.6s: name rises. At 1.0s: est line rises. CTAs are fully visible from load (no animation). Videos are pre-trimmed to start at an interesting frame.
- **`backdrop-filter` pitfall:** Never put `backdrop-filter` on an element that starts at `opacity: 0`. Browsers (especially Safari) apply the filter regardless of opacity, leaking the effect before the animation starts. Use background overlays only for elements that animate in from invisible.
- i18n routing structure is in place from day one — adding new locales requires only a new `src/messages/{locale}.json` and updating `locales` in `src/proxy.ts`.
- **Nav/footer naming:** "Performances" is labelled **"Tickets"** (EN) / **"Ulaznice"** (HR). "Services" is labelled **"Experience"** (EN) / **"Iskustvo"** (HR). The translation keys remain `nav.performances` and `nav.services` — only the string values changed.
- **`.hp a { color: inherit }` specificity pitfall:** This rule (specificity 11) beats `.btn--primary { color: #fff }` (specificity 10), making button text dark on light cards. Fixed with `.hp .btn--primary { color: #fff }` (specificity 20). Apply the same pattern for any new coloured button inside `.hp`.
- **Components requiring `locale` prop for link building:** `Nav`, `Footer`, `Sections`, `Services`, `About`, `Schedule`. Always pass `locale` when composing these.
- **Git branching:** `main` = stable, client-facing (deploys to production). `dev` = active development (Vercel preview URL). Workflow: edit locally → commit to `dev` → push → review on Vercel preview → merge to `main` when stable.
- **Background session isolation:** `.claude/settings.json` has `"worktree": { "bgIsolation": "none" }` — background Claude sessions edit the working tree directly rather than a worktree.

### MVP issues (active development — GitHub Issues #2–#11)

| # | Issue | Status |
|---|---|---|
| [#2](https://github.com/jivancevic/sveta-cecilija/issues/2) | Infrastructure: DO Droplet + Coolify + DNS + deploy | HITL |
| [#3](https://github.com/jivancevic/sveta-cecilija/issues/3) | Payload CMS v3 + PostgreSQL integration | AFK |
| [#4](https://github.com/jivancevic/sveta-cecilija/issues/4) | `/tickets` page wired to Shows collection | AFK |
| [#5](https://github.com/jivancevic/sveta-cecilija/issues/5) | Stripe checkout flow | AFK |
| [#6](https://github.com/jivancevic/sveta-cecilija/issues/6) | QR ticket email via Resend | AFK |
| [#7](https://github.com/jivancevic/sveta-cecilija/issues/7) | Door scan endpoint `/scan/[token]` | AFK |
| [#8](https://github.com/jivancevic/sveta-cecilija/issues/8) | Admin — show management | AFK |
| [#9](https://github.com/jivancevic/sveta-cecilija/issues/9) | Admin — in-person sales | AFK |
| [#10](https://github.com/jivancevic/sveta-cecilija/issues/10) | Admin — order list + manual refund | AFK |
| [#11](https://github.com/jivancevic/sveta-cecilija/issues/11) | Cutover: smoke test + DNS switch from WordPress | HITL |

Target: cutover from `korcula-moreska.com` to `moreska.eu` before peak season (end of June 2026).

### Deferred (post-season)

- Payload CMS content management (About, section pages, Privacy Policy)
- Bulk show-cancellation refunds
- Admin statistics dashboard
- Buyer email CSV export
- Bulk email to ticket holders per show
- `next/image` migration
- SEO metadata (`generateMetadata`) on all pages
- German language support
