# Font option prototype — THROWAWAY

**Question:** Which of the designer's (Tereza) two type systems should moreška.eu adopt?

The brief gave two options. Both are rendered on the **real homepage** so the team
can judge them against actual layout/density, switchable via a floating bar.

| Route | Option | Titles | Body | Small accents (was IBM Mono) |
|---|---|---|---|---|
| `/prototype/option1` | Primary | Labrada SemiBold | Labrada Regular | Neue Haas Grotesk |
| `/prototype/option2` | Secondary | Holise | Neue Haas Grotesk | Neue Haas Grotesk Mono |

Reviewable on **dev.moreska.eu/prototype/option1** and **/option2** once merged to `main`
(staging auto-deploys; prod auto-deploy is OFF so this never reaches moreška.eu).

## How it works

The whole design is driven by three CSS variables (`--font-bodoni` = titles,
`--font-inter` = body, `--font-ibm-plex-mono` = accents). Each option just remaps
those three via `next/font/local` on the page wrapper — no component or CSS edits.
Fonts live in `assets/fonts/brand/` (permanent brand assets; the consuming
prototype code here is the only throwaway part). `.dockerignore` re-includes
that dir so `next/font/local` can resolve it during the Docker `npm run build`.

## When a winner is picked

1. Fold the chosen three fonts into `src/app/(frontend)/layout.tsx` (replace the
   `next/font/google` Bodoni/IBM-Plex/Inter declarations, keep the same variable names).
2. Delete this whole `prototype/` directory (page, fonts.ts, PrototypeBar, this file).
3. Keep the winning family in `assets/fonts/brand/` (already a permanent home) and
   delete the losing option's font files. The `.dockerignore` re-include stays.

## Note on the enlarged type

`prototype.css` bumps every font-size by **+25% (mobile) / +40% (laptop)** via a
generated `.proto-scale` override (layout untouched — no `zoom`). This is a
**legibility aid for evaluating the fonts on screen, not a design spec** — don't
read it as "the real site should be 40% bigger." It's regenerated from
`globals.css` font-sizes; discard it entirely when folding the winner in.

## Verdict

_(pending team review — fill in which option won and why before deleting)_
