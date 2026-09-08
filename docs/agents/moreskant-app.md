# The Moreškant app (`/app`)

The dancer-facing surface of the roster module ([ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](../adr/0024-moreskant-roster-domain.md); phase 3 = #419). Croatian only, mobile first, no ticketing. Glossary in `CONTEXT.md` → *Moreškant*.

## What ships in phase 3 (#420 → #424)

- Moreškant identity on `Members` and the `Users.member` link (#420).
- The `/app` route group: login, the access decision, the season's performance cards, the PWA manifest (#421).
- **Attendance**: the collection, the answer rules, the army count, Dolazim / Ne dolazim on every card (#422).
- **The performance detail** `/app/izvedba/[id]`: armies against thresholds, on-behalf answers, the army move, the card headcount chip (#423).
- **Invitations** (#424): "Pošalji pozivnicu" on a Member, `/app/set-password`, "Zaboravljena lozinka".

Push is phase 4. What `/app` writes is an attendance row, the session cookie and, through the invitation, a dancer's password.

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

## Attendance (#422, #423)

One row per (performance, moreškant) in the `attendance` collection: `status`
(`coming | not_coming`), `army` (`crni | bili | null`), `answeredBy`,
`answeredAt`. **"No answer" is the absence of a row** (glossary: *Attendance*) —
never a third status value. That is why the unique index on
(`performance`, `member`) is load-bearing rather than decorative: the app
upserts on that pair and *deletes* the row to clear an answer. Payload's push
never emits a two-column unique index (`unique: true` covers one column), so
`migrate-zz-attendance.sql` is the index's **only** home — putting it in the
generated `00-base.sql` would only mean losing it at the next regeneration, the
same rule the nickname index from #420 follows.

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

`moreska` reads and writes every row. A `moreskant` **reads** their own rows as
`{ member: { equals: <own> } }` and writes nothing: create, update and delete are
`moreska`-only. Nobody else reaches the collection at all, the backoffice
included. The sidebar entry is `moreska`-only (a voditelj fixing a wrong row
without the developer, #419 story 18).

**Writes are narrower than reads on purpose.** Payload's create operation only
tests the access result for truthiness, so an own-rows `Where` on `create` would
read as "allowed" and the new row's values would never be compared against it: a
signed-in dancer could POST `/api/attendance` for anybody, with any army, after
the start, using the very `payload-token` cookie `/app` hands them. Dancers lose
nothing, because `/app` never writes through collection access — the answer route
runs `overrideAccess: true` and applies the rules. That is also where the TIME
rule lives, since a `Where` cannot express "the related performance has not
started" without a join.

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

## Invitations, set-password and "Zaboravljena lozinka" (#424)

A dancer never registers and never picks a permission: a voditelj presses one
button on the Member and the login comes into existence with the bundle the
voditelj could not have chosen wrong.

### The one button

`InviteMoreskantMenuItem` is an edit-menu item on Members, the Shows pattern
(`useSalesActionsVisible` → `useInviteVisible`, deciding through the pure
`inviteActionVisible`). It renders on a **saved** Members document whose
`isMoreskant` is true, and that test is what hides it from the ticketing
backoffice as well: the six moreškant fields lock *read* to `moreska` (#420), so
a `tickets`-only account is never handed the `true` the rule needs. The
permission list is only a belt to those braces — `/api/users/me` runs with
`overrideAccess: false` and `Users.permissions` is locked to `users`, so a
voditelj's own client user usually carries **no** permission set at all; an
absent list therefore means "unknown", never "denied".

The answer goes to a **toast**. Payload closes the edit-menu popup on click, so
a message rendered inside the item is unmounted before the fetch resolves.

### `POST /api/app/invite`

`requirePermission(req, 'moreska')` first (the chokepoint every staff route
uses), then the `/app` cross-site guard, then the rules in
`src/lib/app/invite.ts`. It refuses with 400 and a Croatian sentence naming the
field to fix when the Member is missing, not `isMoreskant`, not active, or has
no email — the four things a voditelj can repair themselves.

Otherwise it finds the User whose `member` link is this Member and, if there is
none, creates one: `permissions: ['moreskant']` exactly, the `member` link, the
Member's email, a `username` slugged from the nickname (`Cici` → `cici`, `Đuro`
→ `djuro`, colliding names get `cici2`, `cici3`; `src/lib/app/username.ts`) and
a crypto-random password that is never emailed and never used. A second press
finds the same login and only mints a fresh token, which is what a lost email
needs (#419, story 7).

Two decisions live here rather than in a comment somewhere:

- **The Member's email wins.** A voditelj maintains a dancer's contact details on
  the Member row, so an invitation that meets a login carrying a different
  address moves the login onto the Member's. Two addresses for one person would
  mean "Zaboravljena lozinka" silently mailing the stale one.
- **The reset token is targeted by username**, not by address: it is unique,
  stable and unaffected by an email the invitation may just have moved.

### The token lengths, and why the collection sets none

Payload computes a reset token's life as
`collectionConfig.auth?.forgotPassword?.expiration ?? expiration ?? 3600000`
(`payload/dist/auth/operations/forgotPassword.js`). **The collection value wins
over the argument** — it is not the fallback it reads like. So `Users.auth` sets
no `forgotPassword.expiration` at all and each caller passes its own: seven days
from the invitation, one hour from the reset. Setting seven days on the
collection, as the ticket first suggested, would have frozen the reset at seven
days too and ignored the hour in silence. `access.test.ts` guards the absence.

`forgotPassword` is always called with `disableEmail: true`: Payload's own mail
is English and points at `/admin/reset`, which no dancer may open. The Croatian
letters are ours (`src/lib/email/send-moreskant-email.ts`, from
`info@moreska.eu` — the society's identity, not the `tickets@` show stream —
subjects "Pozivnica za Moreškant" and "Nova lozinka za Moreškant").

### `/app/set-password` and `/app/forgot`

`POST /api/app/set-password` runs Payload's `resetPassword`, which stores the
hash **and opens a session**, so the route sets the same cookie the login route
sets and the dancer lands on `/app` signed in rather than on a form asking for
the password they chose two seconds ago. Minimum length is eight, enforced in
`src/lib/app/set-password.ts` because the Users collection sets no minimum of
its own. Bad token, expired token, already-used token: one 400 and one sentence,
because for the dancer they are the same situation.

`POST /api/app/forgot` **always answers 200** with the same sentence — account
found, not found, or found without an email — since the difference between two
answers on a public URL is a list of who has a login. The account lookup is ours
rather than Payload's: `forgotPassword` returns null for an unknown account and
never tells us the address to write to, and we need that address for our own
letter.

Both are unauthenticated, cookie-affecting POSTs outside Payload's CSRF list, so
they carry `appRequestMeta` + `rejectAppRequest` exactly as the login route
does. Neither uses `requirePermission`: there is no caller to authorize, and the
token is the authentication.

### "Ima prijavu"

The Members list column (#419, story 9) is a **virtual** field: no column, so it
cannot drift from `users.member`, which is the truth it reports. It is filled by
ONE `find` per request, memoized on `req.context` and shared by every row of the
list (`src/lib/access/member-logins.ts`) — an `afterRead` doing its own lookup,
or a client Cell fetching `/api/users`, would both cost a query per rendered
line. Read is `moreska`-only like the rest of the roster half; nothing writes it.

### What a dancer cannot do to their own login

`Users.access.update` allows self-edit, so every field of the invitation bundle
carries its own lock to `users`: `permissions`, `member` and — since #424 —
`username`, declared in the collection purely to merge that lock into Payload's
own base field. Verified in the browser: a `moreskant` PATCHing their own row
with a new username, a new permission set and a different member link gets a
200 and no change at all (a denied field is dropped in silence, which is exactly
why the locks are tested).
