# The Moreškant app (`/app`)

The dancer-facing surface of the roster module ([ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](../adr/0024-moreskant-roster-domain.md); phase 3 = #419). Croatian only, mobile first, no ticketing. Glossary in `CONTEXT.md` → *Moreškant*.

## What ships in phase 3 (#420 → #423)

- Moreškant identity on `Members` and the `Users.member` link (#420).
- The `/app` route group: login, the access decision, the season's performance cards, the PWA manifest (#421).
- **Attendance**: the collection, the answer rules, the army count, Dolazim / Ne dolazim on every card (#422).
- **The performance detail** `/app/izvedba/[id]`: armies against thresholds, on-behalf answers, the army move, the card headcount chip (#423).

Invitations (#424) and push (phase 4) are later tickets. The only thing `/app` writes is an attendance row and the session cookie.

## Route group

`src/app/app/` is a third top-level group beside `(frontend)` and `(payload)`, the way `/scan` is: its own `<html>`, no public nav, no cookie banner, no Tailwind, no locale cookie.

- **Fonts** are imported from `src/app/(frontend)/fonts.ts`, never redeclared, so `next/font` emits one copy of each face for the whole app.
- **CSS scope is `.app`** (`src/app/app/app.css`), applied to `<body>`. Never `.hp` or `.inner-page`: mixing those scopes is a documented trap (`frontend-css.md`).
- **Copy** lives in one frozen map, `src/lib/app/strings.ts`. There is no i18n layer and no `src/messages` entry: Croatian is the only language by decision (#419, story 33). "moreška" lowercase, a dancer is a *moreškant*, no em-dashes.
- **`robots: noindex`** is set on the layout metadata and inherited by every page; `src/app/sitemap.ts` lists no `/app` URL and `sitemap.test.ts` asserts it.

## Session: the same cookie as `/admin`, never `/admin/login`

`/app/login` posts to `POST /api/app/login`, which runs Payload's local `login` and sets the cookie **Payload itself builds** (`generatePayloadCookie` from the Users auth config: name, prefix, expiry, `httpOnly`, path, SameSite, Secure). `POST /api/app/logout` clears it with `generateExpiredPayloadCookie` and always answers 200 — signing out of a session that is already gone is a success.

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

1. **Re-reads the Member with `overrideAccess`.** `Users.member` is field-locked to `users` (#420), so `payload.auth()` hands back a session *without* it, by design.
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

## Attendance (#422, #423)

One row per (performance, moreškant) in the `attendance` collection: `status`
(`coming | not_coming`), `army` (`crni | bili | null`), `answeredBy`,
`answeredAt`. **"No answer" is the absence of a row** (glossary: *Attendance*) —
never a third status value. That is why the unique index on
(`performance`, `member`) is load-bearing rather than decorative: the app
upserts on that pair and *deletes* the row to clear an answer. Payload does not
emit a two-column unique index, so it lives in `migrate-zz-attendance.sql` and
is mirrored by hand into `00-base.sql`, next to the nickname index from #420 —
a regenerated baseline drops anything `push` does not emit, so both have to be
put back every time it is regenerated.

### The answer rules

`src/lib/attendance/rules.ts`, pure and table-tested. `decideAttendanceAnswer`
is the whole rule set:

| Caller | May answer for | When | The army |
|---|---|---|---|
| `moreskant` | their own Member only | before the start, not cancelled | never theirs to set |
| `moreska` (voditelj) | any active moreškant | any time, cancelled or long past | theirs alone |

- 403 means "you may not do this" (someone else's answer, an evening that has
  started or been cancelled, an army only a voditelj may set); 400 means "this
  makes no sense" (unknown status or army, an army the member's roles do not
  cover, a member who is not a live moreškant).
- On create the army defaults from the **primary role**: `crni` / `crni_kralj` /
  `otmanovic` → crni, `bili` / `bili_kralj` → bili, `bula` → null. On update it
  keeps whatever the voditelj chose.
- `moreskantMayAnswer()` is the single sentence behind both the lock the route
  enforces and the disabled buttons a dancer sees, so the two cannot drift.

### The army count is the single home of the counting rule

`src/lib/attendance/army-count.ts`. Kings count in their army, an otmanović in
the crni army, a **bula in neither**; only `coming` counts; the no-answer list is
the active moreškanti minus everyone who answered, which is what puts a *guest*
(a dancer with no login) in front of the voditelj's buttons. The card chip, the
detail page and the phase 4 alarm all call it; nothing recomputes a headcount
anywhere else, browser included — a successful answer calls `router.refresh()`
rather than counting locally.

### The one writer

`POST /api/app/attendance` (`{ performanceId, memberId, status: coming |
not_coming | clear, army? }`), guarded by
`requirePermission(req, ['moreskant', 'moreska'])`. The local API runs
`overrideAccess: true`, so the collection access does not gate it — the rules
do. The army move posts through the same route; there is no second writer.

`Users.member` is field-locked to `users`, so `req.user` carries no link:
`resolveOwnMemberId()` (`src/lib/access/attendance-access.ts`) re-reads the
account with `overrideAccess`, and both the route and the collection access use
it. That is also why the `attendance` access functions are **async**.

### Collection access

`moreska` reads and writes every row; a `moreskant` is scoped by
`{ member: { equals: <own> } }`; nobody else reaches the collection at all, the
backoffice included. The TIME rule is deliberately *not* here: a `Where` cannot
express "the related performance has not started" without a join, so it lives in
the route's rules. The sidebar entry is `moreska`-only (a voditelj fixing a
wrong row without the developer, #419 story 18).

### The detail view

`/app/izvedba/[id]`, loaded by `src/lib/app/detail-loaders.ts` (pure) +
`detail-data.ts` (the Payload calls). Read-only is a property of the **viewer**,
not of the page: a moreškant looking back at last week sees the answers as they
were, a voditelj can still correct them. Mobiles are `tel:` links; there is no
email field in the payload to leak (ADR-0024's PII boundary is a property of the
data contract, not of a template, and `detail-loaders.test.ts` asserts it on the
rendered payload).

The voditelj additionally gets Dolazim / Ne dolazim next to every no-answer
nickname, a Poništi on any answer, and a "Prebaci u …" control on a coming
dancer who holds **both** armies. Hiding those controls from a moreškant is
convenience; the route refuses them anyway.

### The card chip

A voditelj's cards carry `Crni n/threshold` and `Bili n/threshold`, red below
threshold, so a short evening is visible without opening it (#419, story 10). It
costs two extra queries and only for the account that has a reason to see them —
a dancer gets the numbers on the detail page.
