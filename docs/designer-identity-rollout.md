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

## Friday bucket (do in one pass when the identity doc lands)

- **Fonts:** map her primary + 2 secondary fonts across the site; Josip then unifies all usages.
- **Palette:** move off black/red to distinguish from the *other* Moreška group. Josip asked
  her for an alternative palette to prototype and compare. Colors today: `--red`, `--noir`.
- **Buttons:** replace Bodoni on `.btn` (`globals.css:69`). Unify the two "Buy tickets" — Hero
  is Inter-700 (`.btn--hero-cta`, `globals.css:77`), Nav is Bodoni base (`.nav__cta`, smaller) —
  into one font family with a clear size hierarchy (top one smaller, same style). Align the
  secondary `.opera__buy` show-card buttons to the same font/corners/size.
- **Corners:** unify to **sharp (radius 0)** — Josip's decision (moreška = blades). Collapse the
  scattered 2/3/4/6/8px radii to 0 across buttons, cards, photos, inputs. Pills (`border-radius:999px`,
  the status dots) are a separate shape, not a corner — leave those. Flag to the designer for sign-off,
  but the direction is set.
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
