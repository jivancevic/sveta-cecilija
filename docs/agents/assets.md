# Assets pipeline

All production assets live in `public/` and are referenced from `src/` — `public/` is the **served set**, not an archive. CLAUDE.md lists the handful of key files (hero videos/posters, logo); this file holds the conventions.

## public/ vs assets/

- Originals and B-roll live in `assets/images/` (and `assets/images/new-images/`), gitignored deploy-side: only `public/` ships to the browser; `assets/` is read-only source kept in the repo for future use.
- Photo originals are untracked and live only in the main checkout — from a worktree, reference them via `../../../assets/images/...`.
- Off-pipeline keepers go in `assets/images/archived/`; fonts not loaded by the app go in `assets/fonts/`.
- **Don't dump candidates into `public/`** — they bloat the Coolify build and the deploy without being served.

## Every photo added to public/ must be optimized webp

Keep the original (jpeg/png/etc.) in `assets/images/`; convert to webp for `public/`:
- `cwebp -q 82`, resized to the largest dimension the layout actually needs (`-resize <maxWidth> 0` for full-bleed heroes, smaller for cards/thumbnails). Never ship a 4000px original at full res.
- Size targets: full-bleed hero photos land in ~150–550 KB; cards/decorative images well under that.
- Check the result with `ls -la` + `identify` before committing, and re-encode at lower quality or smaller dimensions if it's an outlier.

## The PNG logo for the PDF

The PNG variant of the logo lives at **`assets/images/cecilija-logo.png`** (outside `public/`) — used by `@react-pdf/renderer` in `src/lib/email/render-tickets-pdf.tsx`, which can't decode webp. Read via `fs.readFileSync` at module load, embedded as a `<Image>` in the PDF. Don't move it without updating the renderer.
