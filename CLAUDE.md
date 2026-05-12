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
- **Future:** Payload CMS + PostgreSQL for content, Stripe for ticketing, Resend for email, Docker + Coolify on VPS.

### Pages

| Route | File | Notes |
|---|---|---|
| `/[locale]` | `src/app/[locale]/page.tsx` | Homepage — 10 sections |
| `/[locale]/about` | `src/app/[locale]/about/page.tsx` | About HGD — PageHero + intro + 8-vignette history + ensemble cards + CTA |
| `/[locale]/sections/[slug]` | `src/app/[locale]/sections/[slug]/page.tsx` | Section pages (moreska, wind-orchestra, klapa, choir) |

### Key files

| Path | Purpose |
|---|---|
| `src/proxy.ts` | Locale detection & redirect (Next.js 16 "proxy" convention) |
| `src/messages/en.json` | All English strings — nav, hero, about, schedule, history, sections, services, contact, footer, `aboutPage`, `sectionPages` |
| `src/messages/hr.json` | All Croatian strings — same structure as en.json |
| `src/lib/data.ts` | Locale-agnostic data: 24 performances, `HISTORY_VIGNETTES_META` (8), `HISTORY_VIGNETTES_HOME` (4 for homepage), `SECTION_CARDS_META`, `SERVICE_CARDS_META`, `SECTION_PAGE_META` (slug→image+sectionKey) |
| `src/app/globals.css` | Full design CSS + Tailwind + responsive breakpoints |
| `src/app/[locale]/layout.tsx` | Root layout — loads fonts, sets `lang` attribute |
| `src/app/[locale]/page.tsx` | Homepage — composes all section components |
| `src/components/Nav.tsx` | `'use client'` — hamburger + full-screen overlay; `variant` prop: `'homepage'` (position:absolute) or `'inner'` (sticky dark bg) |
| `src/components/Hero.tsx` | `'use client'` — swaps video src (horizontal/vertical) based on viewport width; hero animations, grey wash, logo, CTAs |
| `src/components/PageHero.tsx` | Shared hero for inner pages (image + gradient overlay + h1 + subtitle) |
| `src/components/Contact.tsx` | `'use client'` — form state |
| `Sveta Cecilija/` | Original Claude Design export (reference only — do not edit) |
| `docs/copywriting.md` | English copy for all sections |
| `docs/copywriting-hr.md` | Croatian copy for all sections |
| `docs/design-brief.md` | Visual design brief |
| `docs/performances.md` | Performance schedule source data |
| `docs/sveta-cecilija.md` | Organisation background |

### Assets

All production assets live in `public/`. Key files:
- `hero-horizontal.webm` — autoplay hero video (desktop, ≥768px)
- `hero-vertical.webm` — autoplay hero video (mobile, <768px) — loaded dynamically in `Hero.tsx`
- `cecilija-logo.png` — organisation logo used in Nav, Footer, Hero
- `Vinque-Rg.otf` — custom serif font

### CSS architecture

- **Theme tokens** live in `.t-stone` — `--bg`, `--gold`, `--pad` (section vertical padding), `--sectionPadX` (horizontal padding), `--maxW` (1480px max-width).
- **Homepage sections** (`.hp .t-stone`): `.about`, `.opera`, `.hist`, `.secs`, `.svcs`, `.contact--dark`, `.foot--atmos`
- **Inner pages** (`.inner-page .t-stone`): `.page-hero`, `.ip-*` (section layout primitives), `.sp-*` (section page editorial), `.vignette` (history cards — shared), `.ip-cta` (CTA band)
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

### Design decisions

- Content is **hardcoded** — no Payload CMS yet. Schedule shows next 4 upcoming performances computed dynamically from `SCHEDULE_ALL` in `data.ts`.
- Contact form shows a **local success state** on submit — no email sending (Resend deferred).
- Homepage history section uses 4 vignettes (`HISTORY_VIGNETTES_HOME`); About page uses all 8 (`HISTORY_VIGNETTES_META`).
- No `next/image` — plain `<img>` throughout. Migrate in a later optimisation pass.
- Nav hamburger overlay replaces desktop links below 768px breakpoint.
- Hero animation sequence: overlays fade in immediately (0s, 0.8s duration). At 0.3s: logo image fades in. At 0.6s: name rises. At 1.0s: est line rises. CTAs are fully visible from load (no animation). Videos are pre-trimmed to start at an interesting frame.
- **`backdrop-filter` pitfall:** Never put `backdrop-filter` on an element that starts at `opacity: 0`. Browsers (especially Safari) apply the filter regardless of opacity, leaking the effect before the animation starts. Use background overlays only for elements that animate in from invisible.
- i18n routing structure is in place from day one — adding new locales requires only a new `src/messages/{locale}.json` and updating `locales` in `src/proxy.ts`.

### Next iteration (not yet built)

- Payload CMS integration for performances, content
- Stripe ticketing
- Resend email for contact form
- `next/image` migration
- Full schedule page (`/[locale]/performances`)
- SEO metadata (`generateMetadata`) on all pages
