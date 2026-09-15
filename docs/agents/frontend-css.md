# Frontend & CSS notes

Companion to the **CSS architecture** section in `CLAUDE.md` (which holds the scope map and breakpoints). This file collects the gotchas and the conventions detail.

**This file is the PUBLIC site.** Cecilija (`/app`) has its own scope, its own tokens and its own shared shapes, and none of the rules below apply to it: see "The skin: tokens, shapes and the shell" in `moreskant-app.md`.

## CSS gotchas

- **`backdrop-filter` pitfall:** Never put `backdrop-filter` on an element that starts at `opacity: 0`. Browsers (especially Safari) apply the filter regardless of opacity, leaking the effect before the animation starts. Use background overlays only for elements that animate in from invisible.
- **`.hp a { color: inherit }` specificity pitfall:** This rule (specificity 11) beats `.btn--primary { color: #fff }` (specificity 10), making button text dark on light cards. Fixed with `.hp .btn--primary { color: #fff }` (specificity 20). Apply the same pattern for any new coloured button inside `.hp`.
- **Even grid columns:** use `minmax(0, 1fr)`, not `1fr`, for true even columns (needed to align `.svc` card dividers). `.sp-zz` is the zig-zag rows layout pattern.
- **A filled animation is a stacking context, forever** (#624). `animation-fill-mode: both` keeps an animation's effect applied after it ends, and an element whose animation affects `transform` is a stacking context for as long as that effect applies — so `.app__screen`, which ends on `transform: none`, never stopped being one. Everything `position: fixed` inside it was trapped: `.ui-sheet` at `z-index: 31` could not reach past a tab bar at 20, no matter what `bottom` it was given. Use `backwards` when the `to` frame is the element's resting state (it always is for an entry animation), and render a modal through a portal rather than trusting a z-index to cross a wrapper.
- **A column flex container squeezes before it scrolls** (#624). In `.ui-sheet__body` (`display: flex; flex-direction: column; overflow-y: auto`) a child with no `flex: none` is shrunk to make the content fit before the scrollbar appears — a row of 36px filter pills came out a few pixels tall, but only in the sheets whose list was long enough to overflow, which is why it looked like a mystery rather than a rule. Every direct child of a scrolling flex column needs `flex: none`.
- **`overflow-y: auto` also turns on `overflow-x`.** The two axes cannot disagree: setting one to `auto` or `hidden` computes the `visible` on the other to `auto`. So one child with a negative margin (`.ui-filters` bleeds `-20px` to reach a screen edge) gives the whole container a sideways scroll. State `overflow-x: hidden` on anything that is one column wide by definition.
- **`touch-action` is the INTERSECTION of an element's value and every ancestor's** (#633). A scroller cannot take back what a parent refused: `.app` carried `pan-y`, so `touch-action: pan-x` on the filter strip inside it computed to nothing and the chips would not move sideways — the screen read as stuck rather than as anything a person could fix by swiping more carefully. The permission has to be granted at the top (`.app` says `pan-x pan-y pinch-zoom`, which differs from `auto` only in keeping double-tap zoom off) and narrowed downward, never the other way. A pull-to-refresh over such a scroller needs a real axis lock beside it (`src/lib/app/pull-axis.ts`), because a sideways swipe that sags a few pixels is otherwise read as a pull and `preventDefault`ed.
- **`> * + *` is a ONE-class selector, so any child can delete it** (#644). The shell's spacing floor was `.app__shell > * + * { margin-top: var(--gap) }`, which reads as two classes and is one: `*` carries no specificity. It therefore tied with every single-class `app__*` rule in the same file and lost to each one that came later — and 143 rules below it zero their own margin. On another dancer's profile the gap between two blocks measured **0px** where Moja sezona, which renders the same blocks into a real flex column, measured 20. The container carries a `gap` now. A floor a child can raise is a floor a child can delete.
- **A component with a slot must select its OWN elements with a child combinator** (#641). `Podium` renders the step's count as `<b>` and takes a `badge` slot beside the nickname; the niz flame that lands in that slot carries a `<b>` of its own. `.ui-podium--lg .ui-podium__step--1 b` was written as a descendant, so it also selected the flame's digit — and at three classes plus a type it beat `.ui-flame b`, drawing a 32px number in a pill twice the height of the one a list row wears. A slot is a hole for markup the component has never seen, so every rule inside it aimed at its own elements says `> b`, not `b`. The bug arrives with the second caller, not with the slot.
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
