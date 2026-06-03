# Payload CMS admin customization (v3.84)

How to add/replace custom admin UI without it silently rendering nothing. Collections live in `src/collections/`; the root config is `src/payload.config.ts`; the generated route lives under `src/app/(payload)/`.

## Component references are always string paths

Never direct React imports. Every component slot in `buildConfig` and collection configs (`PayloadComponent` type) takes `'@/path/to/File#ExportName'`. Direct imports (e.g. `Component: CollectionCards`) fail TypeScript.

## Admin component placement map (non-obvious nesting)

- **Custom root admin route** (`/admin/my-page`): `admin.components.views[key]` in `buildConfig`, with `path: '/my-page'`
- **Replace the `/admin` dashboard itself**: `admin.components.views.dashboard.Component` (no `path`). `admin.dashboard.widgets` is *additive* — it appends widgets to the built-in `CollectionCards`, not a replacement. To make the dashboard your component only, use the dashboard view override.
- **Button in collection list header**: `collection.admin.components.views.list.actions`
- **Item in edit view 3-dot menu**: `collection.admin.components.edit.editMenuItems`
- **Hide a collection from the sidebar (per-role)**: `collection.admin.hidden: ({ user }) => !isAdminTier(user)`. Hidden collections also return 404 on direct URL access, not just sidebar omission.
- **Field-level access** (e.g. lock a role/permission field against self-promotion): `field.access: { read, update, create }`. Each takes a function of `{ req }`. The field is silently dropped from updates if the predicate returns false — no error to the caller.
- **No per-row list actions exist in v3** — cancel/single-doc actions belong in the edit view.

## `importMap.js` is manually maintained

`src/app/(payload)/admin/importMap.js` is not auto-generated. Every new component added to `payload.config.ts` or a collection config must also be imported and keyed there. Omitting it causes a silent render failure.

Two tied-together gotchas you must keep in place or every custom admin component (Logo, Icon, edit-menu items) silently renders nothing:

1. **`admin.importMap.autoGenerate: false`** in `payload.config.ts`. Without this, Payload runs its own `generateImportMap` on every reload — it rewrites `importMap.js` *after* `layout.tsx` and `page.tsx` have already imported it, so the in-memory `importMap` reference stays empty `{}`. Symptom: `getFromImportMap: PayloadComponent not found in importMap` for keys that are literally present in the source file.
2. **`src/app/(payload)/admin/[[...segments]]/not-found.tsx` must import the real `importMap`**, not a local `const importMap: ImportMap = {}`. The Payload starter ships with the empty placeholder; the not-found route is rendered for any unmatched admin URL and shares lookup paths with siblings, so an empty map there leaks back into the edit-view document renders. Replace with `import { importMap } from '../importMap'`.

## `MetaConfig` valid keys

Only `titleSuffix` and `defaultOGImageType` are Payload additions on top of Next.js `Metadata`. There is no `favicon` property.

## Auth in custom API routes

Use `payload.auth({ headers: req.headers })` to verify the admin session before calling `payload.create` / `payload.find` / etc.

## Payload cookie auth has a CSRF gate

Payload pushes `serverURL` into its `csrf` allowlist during sanitization. When extracting the `payload-token` cookie, it accepts the request only if `Origin` matches an allowlisted entry, or (no Origin) `Sec-Fetch-Site` is `none` / `same-origin` / `same-site`. Two consequences:

1. **Locally**, `NEXT_PUBLIC_BASE_URL` must match the actual port `next dev` runs on. If they diverge (e.g. `.env.local` says `:3000` but `PORT=3456`), every cookie-authenticated request — including `payload.auth({ headers })` inside server components like `/scan/[token]` — silently returns `user: null` and you get the unauthenticated branch. The `Authorization: JWT` header bypasses this check, which is why `/api/users/me` curls work with header auth but not cookie auth.
2. **In production**, real phone camera scans of QR codes navigate to `https://moreska.eu/scan/[token]` with `Sec-Fetch-Site: none` and no Origin → cookie accepted. Address-bar typing and in-app `/admin` links also work (`none` / `same-origin`). Cross-site initiations (clicking the URL from Slack, Gmail, etc.) get `cross-site` → cookie rejected → page renders the buyer view and the token is never marked scanned. Staff must navigate from within `moreska.eu` for the staff path to trigger.
