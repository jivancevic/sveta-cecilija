# Designer feedback → website rollout plan

Source: `docs/designer-brief.md` (Tereza Šestanović ↔ Josip, 26–30 May 2026).
New visual identity (logo, fonts, colors) lands **Friday**. Strategy: do the
identity-*independent* structural work now; batch everything type/color/logo-coupled
into one pass when the identity doc arrives, so Friday is a clean swap with no layout
churn right before peak season.

## Done now (identity-independent)

- **Contact form restructure** (`src/components/Contact.tsx`, `.form__actions` in `globals.css`):
  `name | email` row → full-width enquiry → full-width message → **single centered
  submit below the message** (was wedged in a 2-col row next to the dropdown, above the
  message). Matches her "center everything + button below message" note. Head was already
  centered.
- **Corners → sharp (radius 0)** (`globals.css`, `--radius` token in `.t-stone`): Josip's locked
  decision (moreška = blades), and identity-independent (radius doesn't depend on fonts/colors/logo
  and causes no layout churn), so pulled out of the Friday batch. All scattered box radii
  (2/3/4/6/8px on `.btn`, `.sp-zz__photo`, `.svc-page__form-wrap`, the booking notices, checkout
  card/input/pay-btn/pdf) now read `var(--radius)`, which is `0px`. Pills (`999px`), dots/circles
  (`50%`) and the hamburger bar (`1px`) are separate shapes — left untouched. **Reversible:** flip
  the one `--radius` token to revert. Still flag to the designer Friday for sign-off, but it's live now.

## Friday-readiness: what's already a token swap

Fonts and the palette are **already tokenized**, so Friday's swap is changing values, not hunting usages:

- **Fonts** are all `var(--font-bodoni)` / `var(--font-inter)` / `var(--font-ibm-plex-mono)` (next/font
  CSS vars wired in `(frontend)/layout.tsx`). To remap families: change the `next/font/google` imports
  in the layout (and the variable names if the new fonts differ). No per-rule edits needed.
- **Palette** lives in `.t-stone` (`globals.css:27`): `--red/--redHover`, `--gold/--goldBright`,
  `--bg/--bgDeep/--noir/--noirSoft`, `--ink/--paper/--light/--lightAlt/--muted`. Change values here.
  ⚠️ Two checkout/confirmation rules use **local fallbacks with different names** (`var(--gold, #b08d57)`,
  `var(--font-mono, …)`) — grep `#b08d57` and `--font-mono` and reconcile them to the `.t-stone` tokens
  in the same pass, or they'll drift off-palette.
- **Corners** are the `--radius` token (above).

## Friday bucket (do in one pass when the identity doc lands)

- **Fonts:** map her primary + 2 secondary fonts (swap the layout's `next/font` imports — see above).
- **Palette:** move off black/red to distinguish from the *other* Moreška group. Josip asked
  her for an alternative palette to prototype and compare. Colors today: `--red`, `--noir`.
- **Buttons:** replace Bodoni on `.btn` (`globals.css:69`). Unify the two "Buy tickets" — Hero
  is Inter-700 (`.btn--hero-cta`, `globals.css:77`), Nav is Bodoni base (`.nav__cta`, smaller) —
  into one font family with a clear size hierarchy (top one smaller, same style). Align the
  secondary `.opera__buy` show-card buttons to the same font/corners/size. (Corners already sharp.)
- **Drop cap:** `.about__body::first-letter` (`globals.css:781`) — parked here. HR opens "HGD"
  (giant gold H, her complaint); EN opens "Since" (reads fine). Decide keep-EN-only vs remove-both
  alongside the new headline font.
- **History subline:** `.hist__sub` → Inter or Bodoni-italic 400 (her note).
- **Headline font:** prominent vs lowercase (her open question — awaiting her direction).
- **Logo:** swap `public/cecilija-logo.webp` (Hero/Nav/Footer) when the new mark arrives.

## Still owned by the designer (Josip is waiting on her)

- Alternative color palette to prototype.
- Headline font: prominent vs lowercase.
- Drop cap on EN: keep or remove.
- **Show-card photos:** she wants them removed (a different photo per card reads as
  "every night is a different show"); Josip keeps them as an inline gallery. **No code change** —
  Josip's direction stands; revisit together Friday.
