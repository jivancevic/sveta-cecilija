# Cecilija: Tailwind + shadcn/ui inside `/app` without touching the public site

> Research for issue #474 (wayfinder map #471). Question: how do Tailwind and
> shadcn/ui live inside `/app` without touching the public site? Answered
> against primary sources (Tailwind v4 docs, shadcn/ui docs and registry
> source, Next.js 16 docs) and this repo as of `origin/main` 2b1ae6c,
> 2026-09-12. Every claim carries its source; "repo" means a file in this
> repository.

## TL;DR

`/app` is already a separate document: it has its own root layout
(`src/app/app/layout.tsx`), its own `<html>`, and its own CSS entry
(`src/app/app/app.css`). Next.js loads a root layout's CSS only for the routes
under it, and a navigation between two root layouts is a full page load, so a
`@import "tailwindcss"` placed at the top of `app.css` reaches the public site
exactly as much as `app.css` does today: not at all. No prefix, no `@layer`
trick and no second config is needed. The one thing to add is
`source(none)` + explicit `@source` lines so the `/app` stylesheet scans only
the `/app` tree and the shadcn components, not the whole `src/`.

The public site's `globals.css` also starts with `@import "tailwindcss"`, but a
grep finds **zero** Tailwind utility classes in the `(frontend)` tree or in
`src/components`. The public site pays for Preflight and the theme variables
and uses none of the utilities. That is a side finding, not part of this
ticket, and nothing here changes it.

## 1. What the repo has today

| Fact | Value | Source |
|---|---|---|
| Tailwind | `tailwindcss` `^4` resolved to **4.3.0**, `@tailwindcss/postcss` `^4`, both devDependencies | repo `package.json`, `package-lock.json` (`node_modules/tailwindcss` entry) |
| PostCSS | `postcss.config.mjs` = `{ plugins: { "@tailwindcss/postcss": {} } }`; no `tailwind.config.*` file exists | repo `postcss.config.mjs` |
| Next.js | 16.2.6, React 19.2.4, Payload 3.84 | repo `package.json` |
| Public site CSS | `src/app/globals.css` (80 KB, 1931 lines) starts with `@import "tailwindcss";` then hand-written CSS scoped under `.hp` / `.inner-page` / `.t-stone`; imported once, in `src/app/(frontend)/layout.tsx` | repo |
| `/app` CSS | `src/app/app/app.css` (49 KB, 2384 lines), scope `.app` on `<body>`, imported once in `src/app/app/layout.tsx`; header comment says "No Tailwind, no `globals.css` import" | repo |
| Admin CSS | `src/app/(payload)/custom.css`, imported in `src/app/(payload)/layout.tsx`, unlayered overrides on top of Payload's own `@layer payload-default` | repo |
| Root layouts | Three documents, each with its own `<html>`: `(frontend)/layout.tsx`, `(payload)/layout.tsx`, `app/layout.tsx` (plus `scan/layout.tsx`) | repo |
| Fonts | `src/app/(frontend)/fonts.ts` loads Labrada twice (`--font-bodoni` for titles, `--font-inter` for body) and Neue Haas Grotesk Display as `--font-ibm-plex-mono`; the `/app` layout imports the same three objects and puts `.variable` classes on `<html>` | repo `fonts.ts`, `app/layout.tsx` |
| Tailwind utilities in use | 0 matches for common utilities (`flex`, `grid`, `px-*`, `text-sm`, `w-full`, `items-center`, ...) across `src/**/*.tsx`; no `@apply`, `@theme` or `@layer` in any CSS file | grep over repo |
| Client boundaries in `/app` | 16 files without `"use client"` (all `page.tsx`, `layout.tsx`, `AppShell.tsx`, `DeniedPage.tsx`, `moje/Board.tsx`); the interactive pieces (`TabBar`, `AttendanceButtons`, `LineupEditor`, forms) are client components | grep over `src/app/app` |
| PWA | `public/moreskant-sw.js` handles `push` and `notificationclick` only: "THERE IS NO FETCH HANDLER AND NO CACHE, on purpose"; manifest `scope: "/app"`, `theme_color: "#b8881a"` | repo `public/moreskant-sw.js`, `public/manifest.webmanifest` |
| Bundler | `next build` on Next 16 defaults to Turbopack; Tailwind runs through the PostCSS plugin either way | Next.js CSS docs (Tailwind section shows the same `postcss.config.mjs`) |

## 2. How `globals.css` consumes Tailwind v4

Tailwind v4 has no JS config and no `@tailwind` directives. `@import
"tailwindcss"` expands to four native cascade layers:

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);
```

(Tailwind docs, Preflight, "How Preflight is included".) Everything else in
`globals.css` is unlayered CSS, and unlayered rules beat every layer in the
cascade (CSS Cascade Layers spec, as used by Tailwind's own "Adding custom
styles" page), which is why the public site's hand-written rules never lose to
Preflight even where they overlap. Utility classes are generated on demand:
Tailwind "scans your project for utility classes" as plain text and emits CSS
"only for tokens that map to known utility classes" (Tailwind docs, Detecting
classes in source files). Theme variables follow the same rule: "By default,
only used CSS variables are generated" (Tailwind docs, Theme, `@theme static`).

Consequence for the public site: because no `.tsx` under `(frontend)` uses a
utility, the compiled `globals.css` carries Preflight, a handful of theme
variables and nothing else from Tailwind. The `.hp *` and `.inner-page *`
`box-sizing` resets in `globals.css` duplicate what Preflight already does,
which is consistent with the site having been written as if Tailwind were not
there.

## 3. Do Preflight and shadcn's variables collide with `app.css` and the `(frontend)` scope?

### 3.1 With the `(frontend)` scope: no, by construction

Next.js: "Global styles can be imported into any layout, page, or component
inside the `app` directory", and a root layout's import "apply to every route"
under that layout (Next.js docs, CSS, Global CSS). A layout with no `layout.js`
above it is a root layout, and "Navigating across multiple root layouts will
cause a full page load (as opposed to a client-side navigation)" (Next.js docs,
`layout.js`, Root Layout). The Next.js caveat that the router "does not remove
stylesheets as you navigate between routes" (CSS docs, Good to know) only bites
inside one document; `/app` and `/` are two documents. So a Tailwind import in
`app.css` produces a stylesheet that is linked only from `/app/*` pages, and
`globals.css` is never linked from them. Nothing under `.hp`, `.inner-page` or
`.t-stone` can see it.

One thing to verify at build time, not to assume: Next's default CSS chunking
"will try to merge CSS files whenever possible, determining explicit and
implicit dependencies between files from import order" (Next.js docs,
`cssChunking`). Two files that are never imported on the same route have no
dependency and no reason to merge, and the three root layouts already prove
this today (`custom.css` does not leak into `/`), but the implementation PR
should still open `/` and `/app` after `next build` and confirm each document
links one CSS file of its own.

### 3.2 With `app.css`: Preflight yes, variables partly

**Preflight.** `app.css` was written for a document with no reset: it sets
`box-sizing` itself (`.app *, .app *::before, .app *::after`) and styles
elements through BEM classes. Preflight will add, inside `/app` only: `margin:
0; padding: 0` on everything, `border: 0 solid` on everything, headings with
`font-size: inherit; font-weight: inherit`, `list-style: none` on `ol, ul,
menu`, `img, svg, video` as `display: block`, and buttons with the default
cursor (Tailwind docs, Preflight; Upgrade guide, "Buttons use the default
cursor"). The `/app` markup has 14 `<h1>` / `<h2>` and 5 `<ul>` / `<ol>` written
without a class (for example `DeniedPage.tsx`, the end-of-season block in
`page.tsx`) that rely on browser defaults for size and bullets. Those are the
regression surface: a one-evening visual pass, fixed either by giving them a
class or by a small compatibility block in `@layer base` that restores heading
sizes and list bullets under `.app` until the screen is rebuilt. Preflight
lives in `@layer base`, so every unlayered rule in `app.css` still wins where
both speak; only the element defaults that `app.css` never declared change.

Do not disable Preflight to dodge this: shadcn components assume it. The
`border` utility sets only `border-width` and relies on Preflight's `border: 0
solid` for the style, and shadcn's own base block (`* { @apply border-border
outline-ring/50 }`) assumes the same (shadcn docs, Manual installation, CSS
file). Tailwind's documented way to drop Preflight is to import `theme.css` and
`utilities.css` without `preflight.css` (Tailwind docs, Preflight), which would
leave every `border`, `divide-*` and `ring` utility in shadcn half-working.

**CSS variables.** shadcn declares its tokens on `:root` (and `.dark`), all
unprefixed: `--background`, `--foreground`, `--card`, `--card-foreground`,
`--popover`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`,
`--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`,
`--sidebar*`, `--radius` (shadcn docs, Theming; Manual installation). `app.css`
declares on `.app` (the `<body>`): `--bg`, `--bgDeep`, `--card`, `--cardEdge`,
`--light`, `--muted`, `--gold`, `--goldBright`, `--red`, `--radius`, `--tabH`.
Three names overlap:

| Name | `app.css` meaning (on `.app`) | shadcn meaning (on `:root`) | Verdict |
|---|---|---|---|
| `--card` | surface `#131313` (10 uses) | card surface | same meaning; define shadcn's `--card` as `#131313` and delete the `app.css` line |
| `--radius` | `0px` (27 uses), the "blades" decision | base radius, default `0.625rem` | same meaning; set shadcn's `--radius: 0px`, delete the `app.css` line |
| `--muted` | **text** colour `#9a9a9a` (61 uses) | a **surface** (its text is `--muted-foreground`) | real conflict |

Because `.app` sits on `<body>`, inside the document a `var(--muted)` resolves
to the `app.css` value for every element, so shadcn's `bg-muted` would paint a
light grey text colour as a surface. Fix at adoption time, mechanically: rename
`app.css`'s `--muted` to `--muted-ink` (one `sed` over one file), then set
shadcn's `--muted-foreground: #9a9a9a`. The public site's `.t-stone` also has a
`--muted`, but that is the other document and never meets shadcn.

shadcn's `@layer base { body { @apply bg-background text-foreground } }` lands
in a layer, so `app.css`'s unlayered `.app { background: var(--bg); color:
var(--light) }` keeps winning until it is deleted; once the tokens carry the
brand values the two say the same thing anyway.

## 4. How to scope Tailwind to the `/app` tree: options compared

| Option | What v4 offers | Fit here |
|---|---|---|
| **Separate CSS entry** (one `@import "tailwindcss"` per root layout) | Native: each stylesheet is its own compilation; `source(none)` + `@source` limit what it scans ("This ensures each stylesheet only includes classes it needs in multi-stylesheet projects", Tailwind docs, Detecting classes) | **Recommended.** It is the structure the repo already has; the /app root layout is the scope |
| `prefix(tw)` | `@import "tailwindcss" prefix(tw)`; classes become `tw:flex`, variables `--tw-color-*` (Tailwind docs, Styling with utility classes; Upgrade guide) | Not needed: no other Tailwind classes exist in the `/app` document to collide with. It also costs: every shadcn file copied from the registry ships unprefixed classes, and `components.json`'s `tailwind.prefix` is documented with the v3 `"tw-"` shape, so the v4 `tw:` rewrite is not something to rely on unverified |
| `important` | `@import "tailwindcss" important` marks every utility `!important` (Tailwind docs). v4 has no selector-scoped form (v3's `important: '#app'` is gone; the upgrade guide only documents the flag and the trailing `!` modifier) | Not a scoping tool in v4; skip |
| `@layer` | Tailwind already emits `theme, base, components, utilities` layers; `@layer` is for ordering, not for limiting where rules apply | Useful for the compatibility block, not for scoping |
| Second config | v4 has no JS config; `@config` only loads a legacy v3 file and drops `corePlugins`, `safelist`, `separator` (Tailwind docs, Functions and directives) | The "second config" *is* the second CSS entry |
| CSS Modules | "Not recommended with Tailwind": each module is a separate Tailwind run, no `@theme` context without `@reference` (Tailwind docs, Compatibility) | Skip |

### Worked config

`src/app/app/app.css`, new head (the existing `.app` rules stay below it and
are retired screen by screen):

```css
/* Tailwind + shadcn for the /app document only. This file is imported by
   src/app/app/layout.tsx, a root layout, so it is linked from /app/* pages and
   nowhere else. source(none) keeps the class scan to the /app tree and the
   shadcn components; the public site is never scanned by this entry. */
@import "tailwindcss" source(none);
@source "./";                          /* src/app/app/**            */
@source "../../components/ui";         /* shadcn components         */
@source "../../components/cecilija";   /* app-level composites, if any */
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* Single dark theme. shadcn's .dark variant is not used: the values that the
   registry puts under .dark go straight on :root. */

@theme inline {
  /* fonts: reuse the three next/font variables the layout already puts on <html> */
  --font-sans: var(--font-inter);           /* Labrada, body   */
  --font-heading: var(--font-bodoni);       /* Labrada, titles */
  --font-mono: var(--font-ibm-plex-mono);   /* Neue Haas Grotesk Display, codes and tags */

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  /* brand names as utilities too: bg-gold, text-gold-bright, border-blood */
  --color-gold: var(--gold);
  --color-gold-bright: var(--gold-bright);
  --color-blood: var(--red);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}

:root {
  /* brand */
  --gold: #b8881a;
  --gold-bright: #d9a526;
  --red: #8b0000;
  --radius: 0px;                      /* sharp corners: moreška = blades (globals.css) */

  /* shadcn tokens, brand values (see section 6) */
  --background: #0a0a0a;
  --foreground: #f5f2ec;
  --card: #131313;
  --card-foreground: #f5f2ec;
  --popover: #131313;
  --popover-foreground: #f5f2ec;
  --primary: #b8881a;
  --primary-foreground: #0a0a0a;
  --secondary: #1c1c1c;
  --secondary-foreground: #f5f2ec;
  --muted: #1c1c1c;
  --muted-foreground: #9a9a9a;
  --accent: #1c1c1c;
  --accent-foreground: #d9a526;
  --destructive: #8b0000;
  --border: rgba(184, 136, 26, 0.28);  /* app.css --cardEdge */
  --input: rgba(184, 136, 26, 0.28);
  --ring: #b8881a;
  --sidebar: #050505;
  --sidebar-foreground: #f5f2ec;
  --sidebar-primary: #b8881a;
  --sidebar-primary-foreground: #0a0a0a;
  --sidebar-accent: #131313;
  --sidebar-accent-foreground: #f5f2ec;
  --sidebar-border: rgba(184, 136, 26, 0.28);
  --sidebar-ring: #b8881a;
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans; }
  /* Preflight compatibility for the screens not yet rebuilt: restore what the
     old markup borrowed from browser defaults. Delete when app.css is gone. */
  .app h1 { font-size: 1.6rem; font-weight: 600; font-family: var(--font-heading); }
  .app h2 { font-size: 1.25rem; font-weight: 600; font-family: var(--font-heading); }
  .app ul, .app ol { list-style: revert; padding-inline-start: 1.25rem; }
  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
}

/* ---- existing .app rules follow, unchanged, until each screen moves ---- */
```

Why each piece:

- `source(none)` + `@source`: Tailwind docs, Detecting classes ("Disabling
  automatic detection"); `@source` paths are relative to the stylesheet.
  Without this the `/app` entry would also scan `(frontend)` and `(payload)`,
  which costs build time and, the day someone writes a utility on the public
  site, would leak that class into the `/app` CSS (harmless, but noise).
- `@theme inline` for font variables: Tailwind docs, Theme, "Referencing other
  variables", and the Next.js font docs' Tailwind v4 example (`@theme inline {
  --font-sans: var(--font-inter) }`). Without `inline` the utility would emit
  `font-family: var(--font-sans)`, which resolves against the wrong element
  when the source variable is set lower in the tree.
- `@theme inline` for colours: this is the shape shadcn's own template uses
  (shadcn docs, Manual installation).
- `--radius: 0px` and the `calc()` scale: the registry's template derives
  `--radius-sm..4xl` from `--radius` (shadcn docs, Manual installation), so one
  brand decision covers every component.
- `cursor: pointer` restore: Tailwind v4 changed buttons to the default cursor
  and documents this exact `@layer base` block to bring the pointer back
  (Upgrade guide, "Buttons use the default cursor"). Keep it: `app.css`
  buttons are pointer today.
- No `@custom-variant dark`: the app is one dark theme (`app.css`
  `--bg: #0a0a0a`), so the `.dark` block collapses into `:root` and no
  `next-themes` provider is needed. shadcn's dark-mode guide is built on
  `next-themes` toggling a `.dark` class on `<html>` (shadcn docs, Dark mode,
  Next.js); with one theme there is nothing to toggle.

`components.json` (write it by hand; the shadcn CLI's `init` auto-detects a
CSS file and in a project with two candidates it must not pick
`globals.css`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/app/app.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Field meanings from shadcn docs, `components.json`: `tailwind.config` "Leave
blank for Tailwind CSS v4"; `tailwind.css` is the "Path to the CSS file that
imports Tailwind CSS into your project"; `rsc: true` means "The CLI
automatically adds a `use client` directive to client components". The
`@/*` alias already maps to `./src/*` in this repo's `tsconfig.json`. Then
`npx shadcn@latest add button card table dialog ...` copies files into
`src/components/ui/`, which the `@source` line above covers.

Nothing changes in `next.config.ts`, `postcss.config.mjs`, `globals.css` or
`src/app/app/layout.tsx`. The layout keeps `<body className="app">` while
`app.css`'s old rules exist and drops the class when the last one goes.

### Dependencies

From shadcn docs, Manual installation: `shadcn class-variance-authority cn
lucide-react tw-animate-css`, plus `radix-ui` (the registry imports `Slot`,
`Dialog`, `Tabs` from the `radix-ui` umbrella package: registry source,
`button.tsx`, `dialog.tsx`, `tabs.tsx`). The registry's `lib/utils.ts` is now
one line, `export { cn } from "cn"` (registry source; shadcn changelog,
September 2026: `cn` is "a drop-in replacement for `twMerge(clsx(...))`"). No
`next-themes` unless `sonner` is adopted unmodified (its registry file imports
`useTheme` from `next-themes`; with one theme, edit the copied file to pass
`theme="dark"` and drop the import, which is the point of owning the source).

## 5. shadcn components under Next 16 server components

- Pages and layouts are Server Components by default; a file marked `"use
  client"` puts itself and everything it imports in the client bundle, but
  "It does not apply to Server Components passed as children or other props"
  (Next.js docs, Server and Client Components). Props crossing into a client
  component must be serializable.
- Which registry files are client components (checked in the `new-york-v4`
  registry source on `main`): **no directive** in `button.tsx` and `card.tsx`
  (pure markup, `cva` + `cn`); **`"use client"`** in `table.tsx`, `tabs.tsx`,
  `dialog.tsx`, `sonner.tsx` and every Radix-backed primitive (dropdown, sheet,
  select, popover, tooltip, sidebar). `rsc: true` keeps that correct when
  files are re-added.
- Practical rule for Cecilija: the 16 server files in `src/app/app` stay
  server components and render `Button`, `Card`, `Badge`, `Separator`,
  `Skeleton` directly; anything with state (dialogs, tabs, dropdowns, the
  sidebar) is a client leaf that receives plain data. That is the same split
  the app has now (`page.tsx` server, `AttendanceButtons` client). The
  shadcn `Sidebar` is a client `SidebarProvider` with `Sheet`, `Tooltip` and
  `Collapsible` behind it (shadcn docs, Sidebar), so the desktop shell of #471
  is a client component wrapping server-rendered `children`, which is the
  documented "slot" pattern.
- `Button asChild` + `next/link` works because `Slot` merges props onto the
  child (registry `button.tsx`); use it for tab-bar and sidebar links so the
  router still does client navigation inside `/app`.
- React 19: shadcn states "full support for React 19 and Tailwind v4 in the
  `latest` release"; the remaining caveat is npm peer-dependency resolution on
  packages that have not widened their `react` range, for which the docs
  suggest `--legacy-peer-deps` (shadcn docs, React 19). Check `npm install`
  output rather than assuming; Radix and lucide are marked compatible there.

## 6. Brand tokens to shadcn theme variables

Brand values come from `globals.css` `.t-stone` and `app.css` `.app`; fonts
from `src/app/(frontend)/fonts.ts`. Tailwind v4 accepts hex and `rgba()` in
`@theme` / `:root` as-is; shadcn's own defaults are `oklch` but nothing
requires it (Tailwind docs, Theme; shadcn docs, Tailwind v4: "HSL colors are
now converted to OKLCH" describes their palette, not a constraint).

| shadcn variable | Brand value | From |
|---|---|---|
| `--background` | `#0a0a0a` | `app.css --bg` |
| `--foreground` | `#f5f2ec` | `--light` |
| `--card`, `--popover` | `#131313` | `app.css --card` |
| `--card-foreground`, `--popover-foreground` | `#f5f2ec` | `--light` |
| `--primary` | `#b8881a` | `--gold` (the brand colour, buttons and rings) |
| `--primary-foreground` | `#0a0a0a` | ink on gold; `custom.css` uses white on gold for admin buttons, pick one in the design ticket |
| `--secondary`, `--muted`, `--accent` | `#1c1c1c` (new, one step above `--card`) | no existing token; needed because shadcn wants three surfaces |
| `--muted-foreground` | `#9a9a9a` | `--muted` (renamed `--muted-ink` in `app.css`, section 3.2) |
| `--accent-foreground` | `#d9a526` | `--goldBright` |
| `--destructive` | `#8b0000` | `--red` (hover `#6e0000` = `--redHover`) |
| `--border`, `--input`, `--sidebar-border` | `rgba(184,136,26,0.28)` | `app.css --cardEdge` |
| `--ring`, `--sidebar-ring` | `#b8881a` | `--gold`; `app.css` already draws a 2px gold `outline` on `:focus-visible` |
| `--sidebar` | `#050505` | `--bgDeep` |
| `--radius` | `0px` | locked "blades" decision in `globals.css` |
| `--font-sans` | `var(--font-inter)` = Labrada | body face; the variable name is historical (`fonts.ts` comment) |
| `--font-heading` | `var(--font-bodoni)` = Labrada, semibold for titles | `globals.css --headlineWeight: 600` |
| `--font-mono` | `var(--font-ibm-plex-mono)` = Neue Haas Grotesk Display | codes, tags, the `.app__tag` family |
| `--chart-1..5` | not needed for v1; if the season statistics screen charts, start from `--gold`, `--goldBright`, `--light`, `--muted-foreground`, `--red` | |

The `@theme inline` block also exposes `bg-gold`, `text-gold-bright` and
`border-blood` so a screen can name the brand directly where the semantic
token would read wrong (a gold divider is not "primary").

## 7. Bundle impact for the PWA

- **CSS.** Utilities and theme variables are emitted on demand (section 2), so
  the `/app` stylesheet grows with the classes actually written, not with the
  size of Tailwind. `tw-animate-css` is CSS-first and tree-shaken the same
  way ("if you don't use `accordion-down`, it won't be included in the final
  CSS file", tw-animate-css README). `shadcn/tailwind.css` (unpkg) is
  keyframes, `data-*` variants and `scroll-fade` / `shimmer` utilities, also
  only realised when used. The fixed cost is Preflight plus the token block,
  a few KB. Today's `app.css` is 49 KB unminified; the rebuilt screens replace
  it rule by rule, so the expected end state is smaller, not larger.
- **JS.** `radix-ui` 1.4.3 is 66.7 KB gzip for the whole umbrella but ships
  `sideEffects: false`, so bundlers keep only the primitives imported
  (bundlephobia); `@radix-ui/react-dialog` alone is 10.8 KB gzip. `cn` 0.3.0
  is 10.4 KB gzip with zero dependencies (bundlephobia), `class-variance-authority`
  0.7 KB gzip. `lucide-react` is in Next's default `optimizePackageImports`
  list, so an `import { XIcon } from "lucide-react"` loads that module only
  (Next.js docs, `optimizePackageImports`). Order of magnitude for a first
  screen with a dialog, a dropdown and a handful of icons: 30 to 40 KB gzip
  of new client JS, loaded only on `/app` routes because only `/app` files
  import it.
- **Service worker.** `moreskant-sw.js` has no fetch handler and no cache, so
  there is no precache manifest to regenerate and no stale-asset window: a
  new deploy's chunks arrive on the next page load exactly as today. Nothing
  in the PWA needs to change for the styling stack; the manifest work in #471
  (name, icon, `start_url`) is a separate ticket.
- **Server payload.** Server-rendered shadcn markup carries long class strings
  in the HTML and in the RSC payload; on a phone over 4G that is noise next
  to the images and fonts already sent. The three font files are shared with
  the public site and unchanged.

## Recommended setup

1. Keep the current structure: `/app` root layout, one CSS entry
   `src/app/app/app.css`. Do not touch `globals.css`, `next.config.ts` or
   `postcss.config.mjs`.
2. Put `@import "tailwindcss" source(none);` plus `@source "./"` and
   `@source "../../components/ui"` at the top of `app.css`, then
   `tw-animate-css` and `shadcn/tailwind.css`, then the `@theme inline` and
   `:root` blocks from section 4 with the brand values from section 6. One
   dark theme on `:root`; no `.dark`, no `next-themes`.
3. Write `components.json` by hand with `tailwind.css: "src/app/app/app.css"`,
   `rsc: true`, `style: "new-york"`, `aliases.ui: "@/components/ui"`. Add
   components with `npx shadcn@latest add ...`; they land in
   `src/components/ui/`, which only the `/app` stylesheet scans.
4. In the same PR: rename `app.css` `--muted` to `--muted-ink`, delete its
   `--card` and `--radius` lines (they move to `:root`), add the `@layer base`
   compatibility block (heading sizes, list bullets, pointer cursor), and do a
   visual pass over the existing `/app` screens for Preflight regressions.
5. Retire `app.css` rules screen by screen as #471's build tickets land;
   remove `className="app"` from `<body>` and the compatibility block with the
   last one.
6. Verify after `next build`: `/` links only its own CSS file, `/app` only
   its own; `grep -c` of a Tailwind utility in the public bundle is zero.

## Gotchas

- **Preflight is document-wide, not scope-wide.** It hits every `/app`
  element the day it lands, including the 14 unclassed headings and 5 lists
  in current markup. Budget the visual pass; do not disable Preflight
  (section 3.2).
- **`--muted` means text in `app.css` and surface in shadcn.** Rename before
  the first `bg-muted` is written, or the surface paints grey.
- **`@theme` without `inline` breaks font variables set on `<html>`.** Use
  `@theme inline { --font-sans: var(--font-inter) }` exactly as the Next.js
  font docs show.
- **The next/font variable names lie.** `--font-inter` is Labrada and
  `--font-ibm-plex-mono` is Neue Haas Grotesk Display (`fonts.ts`). Map them
  once in `@theme inline` and use `font-sans` / `font-heading` / `font-mono`
  in markup; never read the raw names in new code.
- **The shadcn CLI `init` guesses the CSS file.** With `globals.css` and
  `app.css` both present it can pick the wrong one and inject the token block
  into the public site. Hand-write `components.json` and use only `add`.
- **`source(none)` means new directories need an `@source` line.** A shadcn
  block registry or a `src/components/cecilija/` folder that is not listed
  compiles to nothing, with no error: classes simply do not exist. Symptom:
  unstyled component; fix: add the path.
- **Do not add `@import "tailwindcss"` twice in one document.** Two entries
  in one root layout would ship two Preflights and two theme blocks. One per
  root layout, and `/app` has one root layout.
- **Buttons lost `cursor: pointer` in v4.** Restore in `@layer base` (the
  upgrade guide's block) or the door crew taps on things that do not look
  tappable.
- **Radix and the `camera=(self)` header.** Nothing in shadcn touches
  `Permissions-Policy`; the scan station keeps working. Radix `Dialog` does
  lock body scroll and trap focus, so mount the QR scanner outside a dialog.
- **`sonner` pulls `next-themes`.** Edit the copied file for one theme, or
  skip toasts until needed.
- **Payload admin is a separate document too.** `(payload)/custom.css` and
  the admin's own `@layer payload-default` never meet `app.css`; do not try to
  share shadcn components into `/admin` custom views (they would render
  unstyled, since that document loads no Tailwind entry).
- **Tailwind v4 browser floor** is Chrome 111 / Safari 16.4 / Firefox 128
  (Tailwind docs, Compatibility). The dancers' phones are fine; a very old
  door tablet would not be. The public site is already on v4, so this is not
  new exposure.
- **Build-time check, not a belief.** Next's CSS chunking is import-order
  driven and marked experimental in its docs; the three-root-layout isolation
  holds today, and the implementation PR proves it again with a built
  `.next/static/css` listing and a look at both documents' `<link>` tags.

## Sources

- Tailwind CSS v4 docs: Preflight, Styling with utility classes (prefix,
  important), Functions and directives, Detecting classes in source files,
  Theme variables, Adding custom styles, Compatibility, Upgrade guide.
  https://tailwindcss.com/docs
- shadcn/ui docs: Tailwind v4, Theming, Installation (Next.js, Manual),
  components.json, CLI, React 19, Dark mode (Next.js), Sidebar, Changelog.
  https://ui.shadcn.com/docs
- shadcn/ui registry source (`apps/v4/registry/new-york-v4/ui/*.tsx`,
  `lib/utils.ts`, `apps/v4/app/globals.css`) on `main`.
  https://github.com/shadcn-ui/ui
- `shadcn/tailwind.css` as published, https://unpkg.com/shadcn/tailwind.css
- Next.js 16 docs: CSS, `cssChunking`, `layout.js`, Server and Client
  Components, Font module, `optimizePackageImports`. https://nextjs.org/docs
- tw-animate-css README, https://github.com/Wombosvideo/tw-animate-css
- Package sizes: bundlephobia.com (`radix-ui@1.4.3`,
  `@radix-ui/react-dialog@1.1.15`, `cn@0.3.0`,
  `class-variance-authority@0.7.1`, `tailwind-merge@3.3.1`).
- This repo at `2b1ae6c`: `package.json`, `package-lock.json`,
  `postcss.config.mjs`, `next.config.ts`, `src/app/globals.css`,
  `src/app/app/app.css`, `src/app/app/layout.tsx`,
  `src/app/(frontend)/layout.tsx`, `src/app/(frontend)/fonts.ts`,
  `src/app/(payload)/custom.css`, `public/moreskant-sw.js`,
  `public/manifest.webmanifest`.
