# The Moreškant app (`/app`)

The dancer-facing surface of the roster module ([ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](../adr/0024-moreskant-roster-domain.md); phase 3 = #419). Croatian only, mobile first, no ticketing. Glossary in `CONTEXT.md` → *Moreškant*.

## What ships in phase 3 (#420 + #421)

- Moreškant identity on `Members` and the `Users.member` link (#420).
- The `/app` route group: login, the access decision, the season's performance cards, the PWA manifest (#421).

Attendance buttons, the performance detail, invitations and push are **later tickets** (#422 onwards). `/app` currently reads; it writes nothing but the session cookie.

## Route group

`src/app/app/` is a third top-level group beside `(frontend)` and `(payload)`, the way `/scan` is: its own `<html>`, no public nav, no cookie banner, no Tailwind, no locale cookie.

- **Fonts** are imported from `src/app/(frontend)/fonts.ts`, never redeclared, so `next/font` emits one copy of each face for the whole app.
- **CSS scope is `.app`** (`src/app/app/app.css`), applied to `<body>`. Never `.hp` or `.inner-page`: mixing those scopes is a documented trap (`frontend-css.md`).
- **Copy** lives in one frozen map, `src/lib/app/strings.ts`. There is no i18n layer and no `src/messages` entry: Croatian is the only language by decision (#419, story 33). "moreška" lowercase, a dancer is a *moreškant*, no em-dashes.
- **`robots: noindex`** is set on the layout metadata and inherited by every page; `src/app/sitemap.ts` lists no `/app` URL and `sitemap.test.ts` asserts it.

## Session: the same cookie as `/admin`, never `/admin/login`

`/app/login` posts to `POST /api/app/login`, which runs Payload's local `login` and sets the cookie **Payload itself builds** (`generatePayloadCookie` from the Users auth config: name, prefix, expiry, `httpOnly`, path, SameSite, Secure). No `Secure` flag: `cookies.secure` is unset on Users, exactly as for `/admin`.

`POST /api/app/logout` **ends the session**, it does not merely drop the cookie: Users runs with Payload's default `useSessions`, so the JWT stays valid for its full 30 days while its `sid` sits in `users.sessions`. The route authenticates the request, runs Payload's `logoutOperation` to remove that row, then clears the cookie with `generateExpiredPayloadCookie`, and always answers 200 — signing out of a session that is already gone is a success.

Both routes are unauthenticated, cookie-setting POSTs outside Payload's own CSRF list, so they carry their own check: `src/lib/app/request-guard.ts` refuses `Sec-Fetch-Site: cross-site`, refuses a foreign `Origin`, and requires `Content-Type: application/json` (a cross-site HTML form can only send the other three types). A request with neither header — curl, a same-origin navigation — passes.

The identifier field takes an **email or a username** (ADR-0011 hybrid login); which one it is, which status code comes back and what the message says are decided in the pure `src/lib/app/login.ts` and unit-tested through injected deps (`login.test.ts`, the `route-guard.test.ts` pattern). Neither route uses `requirePermission`: there is no caller to authorize yet, and a successful login grants nothing by itself. What the account may *see* is the access decision.

## The access decision

`decideAppAccess(user, member)` in `src/lib/app/access.ts` is a pure function of the login and its linked Member:

| Case | Result |
|---|---|
| holds `moreska` | `voditelj`, with `self` = their own Member when they also hold `moreskant` and that row is a live dancer |
| holds `moreskant`, Member exists, `active`, `isMoreskant` | `moreskant` |
| anything else | `denied` |

Access follows the **roster, not the login table**: unticking `active` or `isMoreskant` locks a dancer out on the next request without deleting anything (#419, story 16). A voditelj with no Member link is valid (story 15); a `moreskant` with a missing or stale link is denied (story 38).

`src/lib/app/viewer.ts` is the IO half. It does the two things the pure decision cannot:

1. **Re-reads the account and the Member with `overrideAccess`.** Not because the session lacks the link: Payload's JWT strategy loads the user through the local API with `overrideAccess: true`, so the `users` field lock on `Users.member` (#420) never applies to `payload.auth()` — the same reason `permissions` reaches `can()`. The re-read is defence in depth (a session issued before a relink cannot decide who a dancer is) and, either way, the Member row itself is a second document the session never carried.
2. **Tells "signed out" from "denied".** Anonymous → redirect to `/app/login`. Signed in but off the roster → the Croatian "Nemate pristup" page with a link to `/admin`.

`toAppMember()` is an explicit projection, never a spread: `members.email` exists since #420 and must never reach an `/app` payload (ADR-0024's PII boundary is mobiles yes, emails no).

## Reads

`src/lib/app/roster-loaders.ts` (pure, DI'd, unit-tested) + `roster-data.ts` (the Payload call and nothing else) — the phase 2 loader split.

- The season is the calendar year (`seasonYear`, ADR-0022), the same definition the phase 2 stats use.
- The roster deliberately sees **every** performance of the season, public and non-public alike: a ship call is an evening a dancer has to turn up for. So the loader does not *filter* on `isPublicPerformance` but does *use* it, to decide how a row renders (public → `VENUE_LABEL.hr`; non-public → free-text `location` + `client`). That reference is what keeps `show-performance-guard.test.ts` green without an allow-list entry.
- The upcoming/past split is at the performance's own start instant in Europe/Zagreb (`showStartMs`), **with no grace window** — unlike the buyer path's `SHOW_GRACE_MS`, a dancer's evening is past the moment it begins.
- Cancelled performances survive only within ±7 days of now (`CANCELLED_WINDOW_MS`), struck through; outside that they disappear.
- The local API runs `overrideAccess: true`, so collection access does not scope these reads. The caller has already established through the access decision that the viewer is on the roster, and roster visibility is society-wide by decision.

## PWA

`public/manifest.webmanifest`: name and short name "Moreškant", `display: standalone`, `start_url` and `scope` `/app`, stone background and gold theme taken from the `.t-stone` tokens, 192 and 512 px PNG icons derived from the Cecilija logo (the webp rule in `assets.md` covers photos in `public/`; manifest icons are PNG by spec). Linked from the `/app` layout only, so no public page advertises it.

**There is no service worker in this phase, deliberately** (#419, story 47): until push exists, a cache layer can only turn app bugs into caching bugs.

The "Dodaj na početni zaslon" hint (`InstallHint.tsx`) is one dismissible line remembered per device in `localStorage`, every access wrapped in `try/catch`, and it is skipped when `display-mode: standalone` says the icon already exists. It is plain instructions rather than an install button, because iOS never fires `beforeinstallprompt` and iOS is where the hint matters most.
