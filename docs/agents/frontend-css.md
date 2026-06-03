# Frontend & CSS notes

Companion to the **CSS architecture** section in `CLAUDE.md` (which holds the scope map and breakpoints). This file collects the gotchas and the conventions detail.

## CSS gotchas

- **`backdrop-filter` pitfall:** Never put `backdrop-filter` on an element that starts at `opacity: 0`. Browsers (especially Safari) apply the filter regardless of opacity, leaking the effect before the animation starts. Use background overlays only for elements that animate in from invisible.
- **`.hp a { color: inherit }` specificity pitfall:** This rule (specificity 11) beats `.btn--primary { color: #fff }` (specificity 10), making button text dark on light cards. Fixed with `.hp .btn--primary { color: #fff }` (specificity 20). Apply the same pattern for any new coloured button inside `.hp`.
- **Even grid columns:** use `minmax(0, 1fr)`, not `1fr`, for true even columns (needed to align `.svc` card dividers). `.sp-zz` is the zig-zag rows layout pattern.
- **Components requiring a `locale` prop for link building:** `Nav`, `Footer`, `Sections`, `Services`, `About`, `Schedule`. Always pass `locale` when composing these.

## `next/image` usage

All `<img>` in the public site use `next/image` (`<Image>`) for responsive srcset + AVIF/webp content negotiation + lazy loading. Two patterns:
- small fixed assets (logos, decorative SVG-like webps) use explicit `width`/`height`;
- full-bleed photos that fill a positioned parent use `fill` with an explicit `sizes` matching the layout breakpoints.

Above-fold images (Hero logo, Nav logo, PageHero bg) carry `priority`. Exceptions: `src/lib/email/render-tickets-pdf.tsx` uses `@react-pdf/renderer`'s `<Image>` (not next/image); `src/app/(frontend)/blog/page.tsx` keeps a plain `<img>` because `post.heroImage` may be a remote URL (Posts collection allows it) and `next.config.ts` has no `images.remotePatterns` allowlist.

## Hero loading & animation

- **No JS loading screen.** The `<video>` element uses a `poster` attribute (`/hero-horizontal-poster.webp` or `/hero-vertical-poster.webp`) so the first frame is visible from the initial paint. The video plays underneath as soon as it's buffered.
- If the poster images are ever re-extracted, extract **frame 0** so the static poster matches the video's first frame exactly — otherwise the swap from poster to video shows a visible "jump":
  ```sh
  ffmpeg -i hero-*.webm -vf "select=eq(n\,0)" -vframes 1 out.png
  cwebp -q 82 out.png -o hero-*-poster.webp
  ```
- **Animation sequence:** overlays fade in immediately (0s, 0.8s duration). At 0.3s logo image fades in; at 0.6s name rises; at 1.0s est line rises. CTAs are fully visible from load (no animation). Videos are pre-trimmed to start at an interesting frame.

## Route groups own their root layout

`src/app/(frontend)/layout.tsx` provides `<html>`/`<body>` for everything inside `(frontend)`. Any page placed OUTSIDE a route group (e.g. `src/app/scan/[token]/page.tsx`) needs its own sibling `layout.tsx` with html/body, or Next.js throws "Missing `<html>` and `<body>` tags". Keep utility-page layouts minimal — don't pull in fonts/CookieConsent that the public site needs.

## Hydration

`<body suppressHydrationWarning>` in both root layouts silences Grammarly's `data-gr-*` injection. Don't strip it.
