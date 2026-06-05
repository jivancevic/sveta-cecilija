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
Fonts live in `assets/fonts/new-fonts/`.

## When a winner is picked

1. Fold the chosen three fonts into `src/app/(frontend)/layout.tsx` (replace the
   `next/font/google` Bodoni/IBM-Plex/Inter declarations, keep the same variable names).
2. Delete this whole `prototype/` directory (page, fonts.ts, PrototypeBar, this file).
3. Move the chosen font files into a permanent location (e.g. `assets/fonts/`) and
   drop the unused ones.

## Verdict

_(pending team review — fill in which option won and why before deleting)_
