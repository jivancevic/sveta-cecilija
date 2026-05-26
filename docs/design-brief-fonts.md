# Design Brief — moreska.eu

Current design tokens for HGD Sveta Cecilija website. All values pulled from `src/app/globals.css` and `src/app/(frontend)/layout.tsx`.

## Typography

Three Google Fonts, loaded via `next/font`:

| Role | Family | Weights / Styles | CSS variable |
|---|---|---|---|
| Headlines, titles, decorative | **Bodoni Moda SC** (small-caps serif) | 400, 600, 700 — normal + italic | `--font-bodoni` |
| Code, tags, ticket codes, eyebrows | **IBM Plex Mono** | 400, 500, 600 | `--font-ibm-plex-mono` |
| Body text, UI, paragraphs | **Inter** | default (variable) | `--font-inter` |

Headlines use `font-weight: 600` (token `--headlineWeight`). Eyebrows above headings are uppercase IBM Plex Mono with wide letter-spacing (`0.18em`) in gold.

A file `public/Vinque-Rg.otf` exists in the repo but is **not currently referenced** anywhere in CSS — safe to ignore or remove.

## Color palette

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#000000` | Page black |
| `--bgDeep` | `#050505` | Deep black (inner-page hero backgrounds) |
| `--noir` | `#0A0A0A` | Dark sections (CTA bands, footer) |
| `--noirSoft` | `#111111` | Slightly lifted dark |
| `--light` | `#F5F2EC` | "Parchment" — light section background |
| `--lightAlt` | `#EDE9E0` | Alt parchment |
| `--paper` | `#D8D8D8` | Paper-grey text on dark |
| `--red` | `#8B0000` | Primary button (dark blood red) |
| `--redHover` | `#6E0000` | Primary button hover |
| `--gold` | `#B8881A` | Accent — eyebrows, rules, links, hover |
| `--goldBright` | `#D9A526` | Hover/active accent (nav, lang switch) |
| `--ink` | `#1A140C` | Body text on light |
| `--muted` | `#9A9A9A` | Secondary/muted text |
| `--rule` | `rgba(184,136,26,0.7)` | Gold hairline rules |

Cookie banner accent uses `#c9a84c` / `#e2c060` (slightly warmer gold variants — could be consolidated with `--gold` family).

## Layout tokens

| Token | Value | Meaning |
|---|---|---|
| `--maxW` | `1480px` | Max content width |
| `--pad` | `130px` | Section vertical padding |
| `--sectionPadX` | `64px` | Section horizontal padding |

**Responsive breakpoints:** 1280px → 1024px → 768px (hamburger appears) → 480px.

## Visual character

- **Homepage** is dark, cinematic — full-bleed hero video, black/gold/red palette, large Bodoni Moda SC titles, grey-to-white gradient on the brand name (silver-foil effect on hero).
- **Inner pages** use a parchment background (`--light` with a subtle paper texture) and dark ink, with the same gold accents and Bodoni headlines for continuity.
- **Buttons:** primary is solid dark red on both themes; ghost is transparent with white border (on dark) — pill-shaped, Bodoni font.
- **Accent rule:** small gold horizontal hairline after every eyebrow (36px wide, 1px tall).
- **Hero animation:** overlays fade in immediately, logo at 0.3s, name rises at 0.6s, "est." line at 1.0s. Posters extracted at 0.5s of each hero video so first paint is never black.

## Assets

- Logo: `public/cecilija-logo.webp` (web) and `assets/images/cecilija-logo.png` (used in PDF tickets — react-pdf can't decode webp).
- Hero video: `public/hero-horizontal.webm` (≥768px) and `public/hero-vertical.webm` (<768px), each with a matching `.webp` poster.

## Notes for the designer

- Plain `<img>` everywhere (no `next/image` yet) — designer doesn't need to provide multiple sizes, just high-quality source files.
- Croatian copy uses lowercase **"moreška"** (common noun); English uses **"Moreška"** (proper noun) — important for any new copy/mockups.
- No em-dashes (—) in user-visible copy — use commas, colons, or periods instead.
