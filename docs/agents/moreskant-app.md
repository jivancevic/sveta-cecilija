# The Moreškant app (`/app`)

The dancer-facing surface of the roster module ([ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](../adr/0024-moreskant-roster-domain.md); phase 3 = #419). Croatian only, mobile first, no ticketing. Glossary in `CONTEXT.md` → *Moreškant*.

## What ships in phase 3 (#420 → #424)

- Moreškant identity on `Members` and the `Users.member` link (#420).
- The `/app` route group: login, the access decision, the season's performance cards, the PWA manifest (#421).
- **Attendance**: the collection, the answer rules, the army count, Dolazim / Ne dolazim on every card (#422).
- **The performance detail** `/app/izvedba/[id]`: armies against thresholds, on-behalf answers, the army move, the card headcount chip (#423).
- **Invitations** (#424): "Pošalji pozivnicu" on a Member, `/app/set-password`, "Zaboravljena lozinka".

Phase 4 batch A (#431, #435) adds **push**, batch B (#436, #433) the triggered
notifications, the note edit and the calendar feed, batch C (#432, #437) the
**lineups** and the **statistics**: see the sections at the end. What `/app` writes is an attendance row, a push subscription, the session cookie and, through the invitation, a dancer's password.

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

**The service worker arrived with push (#431) and still caches nothing** — the phase 3 reason (#419, story 47) survives it: a cache layer over server-rendered roster data can only turn app bugs into caching bugs. Details in the Push section below.

The "Dodaj na početni zaslon" hint (`InstallHint.tsx`) is one dismissible line remembered per device in `localStorage`, every access wrapped in `try/catch`, and it is skipped when `display-mode: standalone` says the icon already exists. It is plain instructions rather than an install button, because iOS never fires `beforeinstallprompt` and iOS is where the hint matters most. Since #431 that same component is also the notifications banner (Push, below).

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

A mail that throws answers **502** with a sentence saying the login exists and
the letter does not: by then the account has been created and the token minted,
and a 500 would leave the voditelj guessing which half happened. Pressing again
is the fix, and it is idempotent.

Two decisions live here rather than in a comment somewhere:

- **The Member's email wins.** A voditelj maintains a dancer's contact details on
  the Member row, so an invitation that meets a login carrying a different
  address moves the login onto the Member's. Two addresses for one person would
  mean "Zaboravljena lozinka" silently mailing the stale one.
- **The reset token is targeted by username**, not by address: it is unique,
  stable and unaffected by an email the invitation may just have moved.

### The token lengths

Seven days from the invitation, one hour from the reset, each **passed per
call** because `Users.auth` deliberately sets no `forgotPassword.expiration` —
Payload's precedence there is the opposite of what it reads like, and the whole
explanation lives once next to that config in `src/collections/Users.ts`
(guarded by `access.test.ts`). `issueAppResetToken` in
`src/lib/app/account-data.ts` is the single caller both routes go through.

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

Three things a reset does **not** do, each of which has surprised somebody:

- It does not clear a **login lockout**. Payload locks an account after its
  `maxLoginAttempts` and a new password does not unlock it, so a dancer who
  guessed their way into the lockout waits it out (or a `users` holder unlocks
  the row) even after setting a new one.
- It does not **revoke other sessions**. Payload's sessions live in
  `users.sessions` and `resetPassword` adds one rather than clearing the rest,
  so a phone that was already signed in stays signed in. "Set a new password" is
  not "sign everyone else out" here.
- The **"Member's email wins" rule of a resend overwrites an address the dancer
  changed themselves** on their own account page. The Member row is where a
  voditelj maintains contact details, and the next invitation moves the login
  back onto it; a dancer who wants a different address asks the voditelj to
  change it on the Member.

`POST /api/app/forgot` **always answers 200** with the same sentence — account
found, not found, or found without an email — since the difference between two
answers on a public URL is a list of who has a login. The account lookup is ours
rather than Payload's: `forgotPassword` returns null for an unknown account and
never tells us the address to write to, and we need that address for our own
letter.

It is **throttled** per identifier and per IP (3 and 10 an hour,
`src/lib/rate-limit/forgot-rate-limit.ts`, the `claim-rate-limit.ts` shape),
because otherwise it is a free mail cannon aimed at one dancer's inbox and a
cheap way to keep invalidating the token a voditelj just issued. A throttled
caller gets the same 200 sentence, no token and no mail: a 429 would tell them
the guess was worth throttling. The send itself is **fire and forget** for the
same reason the sentence is fixed — awaiting the Brevo round-trip made a hit
measurably slower than a miss, and a stopwatch is all it takes to turn one
answer into two.

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

The `afterRead` hook runs on **every** read of a Member, the local API included
(a comp-order lookup, a promo-code page), not only on the admin list. The memo
is what keeps that cheap, and it only applies where there is a `req.context` to
hang it on: a call without one pays for its own query.

### What a dancer cannot do to their own login

Every field of the invitation bundle is locked to `users`, which is what keeps
the bundle the voditelj issued: the rule and its reasoning live in
`permissions.md` ("A dancer's login is issued, never self-registered").
Browser-verified once, and worth knowing when reading a 200 in the network tab:
a `moreskant` PATCHing their own row with a new username, permission set and
member link gets a **200 and no change at all**, because a denied field is
dropped in silence.

## Push (#431, #435 — phase 4 batch A)

Web push is the **only** notification channel (ADR-0024): no email, no SMS. What
ships here is the plumbing plus two of the five notification types — the
**alarm** (1) and the **T-48h reminder** (2). Types (3), (4) and (5) are #432.

### The service worker lives at the ROOT, and that is load-bearing

`public/moreskant-sw.js`, registered with `scope: '/app'`. A worker's default
maximum scope is its own directory, so a script under `public/app/` could only
claim `/app/` — and `/app/` does **not** cover `/app` itself, which is the page
the banner lives on: `navigator.serviceWorker.ready` there waits forever. Found
in a real Chrome, not in a test. From the root the allowed maximum is `/`, so
`/app` is granted with no `Service-Worker-Allowed` header.

The worker handles `push`, `notificationclick` and `pushsubscriptionchange`.
**There is no fetch handler and no cache**, deliberately: phase 3's reason still
holds (`/app` is server-rendered from data that changes hour by hour, so a cache
could only turn app bugs into caching bugs). A click opens
`/app/izvedba/[id]`, reusing an already-open window rather than stacking copies.

### Two raw tables, not collections

`db/schema/migrate-push.sql` (probe: `scripts/probe-push-schema.mjs`).

- `push_subscriptions` — one row per **device**: user, endpoint, the two keys,
  user agent, timestamps. `endpoint` is unique across the whole table, not per
  user, and the subscribe route upserts on it: the endpoint *is* the device, so
  when a dancer signs out of a shared phone and a voditelj signs in, the row has
  to **move** rather than exist twice. `ON DELETE CASCADE` from `users`.
- `performance_notifications` — the once-per-performance claim, unique on
  (performance, type).

Neither is a Payload collection: nobody edits them in `/admin`, and a
subscription is a browser secret rather than a document (`marketing_optouts` is
the same shape). They are therefore absent from `00-base.sql` and must stay
absent — the drift gate only requires the bootstrap schema to be a **superset**
of Payload's. The file is named `migrate-push.sql`, not `migrate-zz-push.sql`:
its FKs reach only `users` and `shows` (both in `00-base.sql`), and
`migrate-zz-drop-users-role.sql` has to remain the last `migrate-*` file (#398).

### The routes

| Route | Gate | Notes |
|---|---|---|
| `POST /api/app/push/subscribe` | `requirePermission(['moreskant','moreska'])` + `/app` guard | upsert on endpoint; 400 without endpoint **and** both keys |
| `POST /api/app/push/unsubscribe` | same | deletes the caller's OWN row for that endpoint; 200 even when nothing went |
| `POST /api/app/alarm` | `requirePermission('moreska')` + guard | `{ performanceId, includeNotComing }`, no throttle, returns device counts; **409 for a performance that has already started**, 400 for a cancelled one |
| `POST /api/cron/moreskant-notifications` | `CRON_SECRET` bearer | the alarm + reminder jobs; 500 when the secret is unset |

### The sender

`src/lib/push/send.ts` fans out over a user list with an injected poster (the
real one is `web-push` in `web-push-poster.ts`, the only file that imports it).
**404 or 410 deletes the row** — the subscription is gone for good; every other
failure leaves it alone, because unreachable this minute is not gone. One user
with a phone and a tablet is one *recipient* and two *devices*, and the number
the voditelj is shown is the devices that actually took the message.

Missing VAPID keys are a deployment state, not an error: `createSender` degrades
to a sender that reports zero (with one `console.warn`), so a developer without
keys still gets a working `/app` and an honest "0 uređaja". The cron summary
carries `pushEnabled: false` in that case, because otherwise a misconfigured
production is a log full of zeros that reads exactly like a quiet week.

**A message decides its own TTL.** An alarm expires WITH the performance it is
about (`alarmTtlSeconds`, floor one minute): a push service holds a message for
its whole TTL, so a flat twelve hours would wake a phone that came back online
after the evening had begun. A reminder keeps twelve hours — two days out, a
night in a tunnel changes nothing.

**Only performances ahead of now ever trigger anything** (#430, story 20), the
manual alarm included: `handleManualAlarm` answers 409 for an evening that has
started, and the detail page hides the button through `canAlarm` from the loader
(a `Date.now()` in render is an impure call the React compiler rejects).

### The timing rules

`src/lib/push/schedule.ts`, pure over a fake clock.

- **Alarm**: due from T-6h, or from **18:00 the evening before** when the
  performance starts before 14:00 Zagreb; closed at the start. The evening-before
  time is a wall-clock reading, so it goes through `zagrebWallClockMs` and
  resolves at +01:00 after the October switch.
- **Reminder**: due from T-48h and **closes 24 hours later** (`REMINDER_WINDOW_MS`).
  The closing edge is a decision: left open until the start, the reminder would
  also fire six hours before on top of the alarm, and a performance entered at
  the last minute would greet the roster with "izvedba je za dva dana" about an
  evening that is nearly over.

### The claim, and why the alarm is claimed even when skipped

The cron runs every 15 minutes, so "exactly once per performance" is a property
of the data, not of the schedule: `INSERT … ON CONFLICT DO NOTHING RETURNING id`
on `performance_notifications`, the dispute-claim pattern
(`src/lib/dispute/handle-dispute.ts`). The **claim is taken before** the
threshold question, so an evening judged covered at T-6h stays judged and one
late "ne dolazim" cannot ring twenty phones at midnight. A claim whose send then
throws is released; a send that simply reached nobody keeps its claim, because
there is nothing to retry. Each run reads the answers and the roster **once**
(`countForAlarm`): the count that decides "is an army short?" is the count the
sentence states, and a second read would let an answer landing between the two
send a headcount that is not the one judged short.

Both cron routes compare their bearer with `timingSafeEqual`
(`src/lib/cron-auth.ts`), because a scheduler-facing URL on a small box is
exactly the stable target a byte-at-a-time timing compare leaks to. A voditelj who disagrees has the manual alarm, which
has no claim and no limit.

### The banner

`InstallHint.tsx` is now the one banner and asks the two questions in order
(#430 stories 1-3): no `PushManager` and not installed → the iOS "add to the home
screen" line; supported and unsubscribed → "Uključi obavijesti"; already
subscribed → one muted line with the per-device off switch, which is the whole of
the per-device control (story 5). Whether **this** device is subscribed is read
from the browser, never from the server, and the component renders nothing until
it has looked.

## Triggered notifications (#436 — phase 4 batch B)

Types (3), (4) and (5) of the glossary, on top of batch A's sender. Nothing here
is scheduled: each one is a consequence of somebody saving something.

### The Shows `afterChange` hook

`src/lib/push/shows-hook.ts` is Payload's calling convention; the whole decision
is the pure `decidePerformanceNotification` (`performance-change.ts`) over two
snapshots of the row.

- **The watched set is five facts**: date, time, PLACE, cancelled status,
  voditelj note. "Place" is one fact rather than two fields — the venue label on
  a public row, the free-text `location` on a booking — and the rule lives in
  `src/lib/app/performance-place.ts`, shared with the calendar feed. Everything
  else on the row is invisible to the roster, which is what keeps a ticket sale
  (`onlineSold` ticking on every purchase) from ringing twenty phones.
- **A create sends "nova izvedba"**, an update sends what changed, and a
  cancellation gets its own title because it is the one change that means "do
  not come". Per save, no coalescing (#430, story 19).
- **Only a performance still ahead notifies anybody** (story 20), create
  included.
- **Recipients**: every active moreškant *with a login*, minus the ones who
  answered "ne dolazim" (type 3 only). A dancer without a login has no user id
  and drops out at `toUserIds`, the single place that happens.
- **A moved date or time releases the `alarm` and `reminder` claims** on
  `performance_notifications` (#440 review). The claim was taken against the old
  start instant, so without the release a rescheduled evening would never alarm
  again. The release is conditional on the START having moved and on nothing
  else: a venue move, a note or a cancellation leaves the claims alone, while a
  performance dragged out of the past releases them and still notifies nobody.
- **The fan-out is DETACHED and the claim release is awaited** (#441 review).
  Payload runs `afterChange` inside the save's transaction, so awaiting a push
  to every device would hold that transaction open for a round trip to FCM per
  phone. The release is one fast DELETE on the same connection, and a release
  that silently did not happen is the defect above; `NotifyOutcome.sending` is
  the detached promise, returned for tests and never awaited in production.
- **Every change notification carries its own tag** (`change-<id>-<updatedAt>`).
  A tag per performance would collapse the shade, and a dancer who had not yet
  read "vrijeme" would find only "poruka voditelja" in its place. The alarm
  keeps its collapsing tag: two alarms are the same plea twice.
- **The two raw-SQL admin actions notify from the route, not from the hook**
  (`src/lib/push/raw-save.ts`). The #379 reschedule and the #94 venue move are
  optimistic-concurrency `UPDATE … RETURNING` claims that never touch the
  collection, so no hook fires for them — and they are the two changes that
  matter most. Each reads the row before and after its claim and calls
  `notifyPerformanceFactsSaved`, so the decision is not duplicated.
- **A bulk create is ONE announcement.** `/api/shows/bulk-create` writes a season
  in a loop; each `payload.create` carries `context.skipRosterPush`, the hook
  honours it, and the route sends a single "N novih izvedbi" pointing at `/app`.
- **The hook can never fail a save.** `notifyPerformanceSaved` catches, logs and
  returns; the hook wraps the dep construction in its own try/catch. A voditelj
  must be able to cancel a performance while a push service is down.

`Shows.test.ts` asserts the exact hook list, so a fourth hook has to be
justified there. The hook sends push and only push: buyer email is still only
ever sent by the explicit admin actions (ADR-0024 rejected mail as a roster
channel).

### The withdrawal (type 5)

`POST /api/app/attendance` fires `deps.onAnswered` after a successful write and
the route hands it to `notifyWithdrawal`. The rule is `isWithdrawal`
(`src/lib/push/withdrawal.ts`): a `coming` that became anything else (including
a *cleared* row, which is the absence of a row), answered by the DANCER for
their own Member, within 24 hours of a start that has not happened yet. A
voditelj correcting somebody's answer notifies nobody — they are the audience.
The audience is every **unshared** user holding `moreska`, read straight off
`users_permissions` (`loadVoditeljUserIds`), because `permissions` is a hasMany
select in its own table and a Payload `contains` query does not reach it. The
`shared IS NOT TRUE` half is a rule, not an optimisation: the society's shared
`member` login (ADR-0022) holds `moreska` and lives on whatever phone last
signed in. Deps are built lazily and the send is detached, so an ordinary
"dolazim" costs no pool lookup and a withdrawal never makes the dancer wait for
the voditelji's phones.

### The note edit

`POST /api/app/note` (`requirePermission(req, 'moreska')` + the `/app` guard,
`{ performanceId, note }`) saves **through the collection** with
`payload.update`, which is the entire point: the `afterChange` hook fires and a
note typed on the pier notifies the roster exactly as an `/admin` save does. An
emptied note is stored as `null` so "no note" has one representation. The field
with its Spremi button is `NoteEditor.tsx` on `/app/izvedba/[id]`, rendered for a
voditelj only (the route refuses everyone else anyway). It never auto-saves:
pressing the button is the moment a voditelj decides to tell the roster.

## The calendar feed (#433 — phase 4 batch B)

`GET /api/app/calendar/<token>.ics`, one **shared** token in
`CALENDAR_FEED_TOKEN` (ADR-0024 amended: shared, not per user). The season's
dates are noticeboard information, one link can be pasted in the WhatsApp group,
and a per-user feed would buy a token table and a revocation story for nothing.

- The route directory is `[token]`, not `[token].ics`: Next's App Router matches
  whole segments, so the `.ics` suffix (which some clients read before they look
  at the content type) is stripped in `tokenFromSegment`.
- The token is compared with `secretMatches` (`src/lib/timing-safe.ts`, extracted
  from `cron-auth.ts` so both share one comparison). A mismatch is **404** — to
  anyone without the token the URL does not exist; a missing env var is **500
  with a log**, because a silent 404 there looks exactly like a wrong link.
- `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private,
  max-age=3600`. `private` matters: the URL contains the secret.
- The builder (`src/lib/calendar/ics.ts`) is pure. UID `performance-<id>@moreska.eu`
  (stable across a reschedule, so a client updates rather than duplicates),
  DTSTART/DTEND in **UTC** through `zagreb-time.ts` (one hour long), SEQUENCE
  from `updatedAt` in epoch seconds, `STATUS:CANCELLED` rather than removal, RFC
  5545 escaping and 75-**octet** folding (Croatian diacritics are multi-byte, so
  folding by character length would both overrun and split a letter). No VALARM:
  the app's push is the reminder.
- The feed carries the current and future seasons, public and non-public alike
  (the roster rule), which is why `calendar-data.ts` is on the
  `show-performance-guard` allow-list.
- The `/app` "Kalendar" panel (`CalendarPanel.tsx`) renders
  `NEXT_PUBLIC_BASE_URL` + the path with a copy button, and is simply absent when
  either half is unset.

## Lineups / postave (#432 — phase 4 batch C)

Who danced which dance role at one performance: the `lineups` collection
(performance → Shows, member → Members, role from the dance-role enum), unique
on (performance, member) — one role per dancer per evening, which is what stops
the statistics double counting. Glossary: `CONTEXT.md` → *Lineup (postava)*.

**Confirmation is one flag per evening, not per row**: `shows.lineupConfirmed`
plus `lineupConfirmedAt`, both roster fields (`moreska`). A postava is confirmed
as a whole, and half a confirmed evening is not a state anybody means.

### Read is scoped by the performance, not by the member

That is the one place this differs from attendance. `moreska` sees everything; a
`moreskant` gets `{ 'performance.lineupConfirmed': { equals: true } }` on
**read** and nothing on create, update or delete. Reaching THROUGH the
relationship rather than carrying a list of ids is deliberate: an id list would
go stale between the access decision and the query, and a lineup unlocked mid
request has to stop being visible immediately (story 34). Writes stay a plain
boolean for the reason `attendance-access.ts` sets out at length — Payload's
create tests the result for truthiness, so a `Where` there reads as "allowed".

### The two writers

| Route | Gate | Notes |
|---|---|---|
| `POST /api/app/lineup` | `requirePermission('moreska')` + `/app` guard | `{ performanceId, entries: [{ memberId, role }] }`; replaces the WHOLE lineup in one transaction; **409** when the lineup is confirmed; 400 for an unknown role, a duplicated member, or somebody who is not an active moreškant |
| `POST /api/app/lineup/confirm` | same | `{ performanceId, confirmed }`; `confirmed` must be a real boolean, or 400 — an absent value must never unlock an evening by accident |

Replace, not patch: the editor holds the whole list in front of the voditelj, so
"these are the people who danced" is the sentence they mean, and the route
implements the same operation.

409 rather than 403 is a decision: the voditelj IS allowed, after they press
Otključaj.

### The shows row lock is what makes the 409 true

Both writes read `shows.lineupConfirmed` and then act on it, and the read and
the act are separate statements. `src/lib/lineup/write-tx.ts` therefore takes
`SELECT lineup_confirmed, lineup_confirmed_at FROM shows WHERE id = $1 FOR
UPDATE` **inside** the transaction that then writes, and both routes take that
same lock on that same row. Without it (#442 review):

- a Potvrdi landing between a Spremi's 409 check and its inserts leaves a
  **confirmed** evening holding the list the voditelj was still editing — which
  is the one thing "Potvrdi locks it" promises cannot happen;
- two concurrent replaces interleave their delete and their inserts, and the
  result is the union of both lists or a 500 from the unique index;
- a double-tapped Potvrdi re-stamps `lineupConfirmedAt`.

The 409 is therefore decided **twice**, and only the second one counts: the
handler's `loadPerformance` pre-check saves a transaction in the ordinary case
and proves nothing about the moment of the write. Both answer with the same
status and the same sentence, so a race and a plain refusal read identically to
whoever is holding the phone.

The lock has to run on the **transaction's own connection**:
`payload.db.sessions[transactionID].db` is the drizzle handle Payload's own
operations use once you pass them `req: { transactionID }`, while
`payload.db.pool` hands out a different connection whose `FOR UPDATE` would lock
nothing and deadlock against the transaction. `lineup-store.ts` is the only
place that knows this; `write-tx.ts` owns the order and is unit-tested over a
fake executor that flips the flag between the pre-check and the locked read —
the only way to test that race deterministically.

The writes themselves still go through the local API with the same
`transactionID`, never raw SQL, so the `lineups` hooks and the Shows
`afterChange` still run.

### Two rules that live under the lock

- **An empty postava may not be confirmed** (400, `lineup.confirmEmpty`; the
  button is disabled too). "Confirmed" is what publishes a lineup and what lets
  it count in the statistics, and an evening confirmed with nobody in it only
  makes every dancer read "još nije objavljena" about a list that is final.
- **Re-confirming does not re-stamp** `lineupConfirmedAt`: a second tap on a
  pressed button is not a second decision. Unlocking clears it, so the timestamp
  never outlives the confirmation it records.

Both are `decideConfirmation`, pure, over the state read under the lock.

### Confirming rings nobody, on purpose

The confirm route saves through the collection, so the roster `afterChange` hook
fires on every Potvrdi and Otključaj. Its diff watches date, time, place,
cancellation and the voditelj note only, so nothing is sent. That is a decision,
not an accident of the current diff, and `shows-hook-lineup.test.ts` pins it: a
"postava objavljena" notification would be a **sixth** type added deliberately
(#430 lists five), not one leaking out of this save.

### `/admin` CRUD bypasses Otključaj

The `lineups` collection is in the sidebar for `moreska`, and a row edited there
goes through neither route — so it changes a **confirmed** postava without
anybody unlocking it, exactly as the attendance collection lets a voditelj fix a
wrong answer. That is what it is for: repairing one wrong row without the
developer, never the way a lineup is entered. The app is the entry surface; the
collection is the tweezers.

### The rules are pure

`src/lib/lineup/rules.ts`:

- **`buildLineupFromAttendance`** — "Napravi iz prisutnosti" (story 27). Only
  `coming` answers; the role is the member's **primary role**, and the stored
  army wins only when it CONTRADICTS that role. An attendance row's army is
  derived from the primary role on create, so a stored `crni` against a
  `crni_kralj` profile is nobody's decision and must not demote the king; a
  stored `bili` against it is the voditelj's "Prebaci u ..." and does. A bula
  carries no army and stays a bula.
- **`roleWarnings`** — a role outside the member's profile is a **warning and
  still saves** (story 29): a bula danced by a crni in an emergency has to be
  recordable as it happened. It is pure, so `LineupEditor.tsx` **imports and
  calls it** rather than re-implementing the test: the line appears the moment
  the select changes and can never say something the route would not.
- **`compareLineupRows`** — the order a postava is read in: crni kralj,
  otmanović, bili kralj, bula, then the two armies, and nickname within a role.
  "Am I kralj tonight" is answered by the top of the list, which is also the
  order the paper list on the pier is written in. Shared by the editor and the
  dancer's view, so one evening can never be presented in two orders.
- **`validateLineupEntries`** — the two things that are nonsense rather than
  unusual: an unknown role and a member listed twice. A member outside the
  active roster is refused too; that is about the PERSON, not the role.

The suggestion costs no round trip: it is a pure function of data the detail
loader already has, so the server computes it and hands it down as a prop.

### Cascades

`cascadeShowLineupDelete` / `cascadeMemberLineupDelete` mirror the attendance
pair, for the same reason: both FKs are `ON DELETE SET NULL` on `NOT NULL`
columns (Payload's own shape, which the drift gate pins), so the database itself
refuses to delete a performance or a Member that is still in a postava.
`scripts/probe-lineup-schema.mjs` proves that against real Postgres.

### Schema

`db/schema/migrate-zz-b-lineups.sql`. **The `-b-` is a sort key, not a word**:
bootstrap applies these files in filename order, the file has to land after
`migrate-members.sql` / `migrate-shows-performance.sql` and before
`migrate-zz-drop-users-role.sql`, which must stay the last `migrate-*` file
(#398, asserted by `db-schema-safety.test.ts`) — and a plain
`migrate-zz-lineups.sql` would sort after it. The two-column unique index lives
only there, never in the regenerated `00-base.sql`.

## Statistics (#437 — phase 4 batch C)

`/app/statistika`: one row per active moreškant for the selected season —
confirmed performances danced, and how many times as crni kralj, bili kralj,
otmanović and bula. Tapping a row reveals the split by performance kind.
Society-wide, like the rest of `/app`: every moreškant sees the whole table.

- **Only confirmed lineups count** (story 39). The filter is on the
  *performance*, and it lives in `aggregateDancerStats`
  (`src/lib/lineup/stats.ts`) rather than in the query, so it is stated once and
  tested directly.
- **A dancer who danced nothing is still a row, at zero** — a scoreboard that
  hides the zeros reads as if those dancers did not exist.
- Sorted by performances danced, then nickname (Croatian collation).
- The season is the calendar year (`seasonYear`, ADR-0022); `?sezona=YYYY`
  chooses it and anything unparseable or unknown falls back to the current one,
  so a mistyped bookmark shows this year's table rather than an error.
- The loader (`stats-loaders.ts` + `stats-data.ts`, the phase 2 split) fetches
  the season's performances, then the lineups of the **confirmed** ones in ONE
  query — never one query per evening — and skips that query entirely when
  nothing is confirmed, since an empty `in` list would ask for every lineup ever
  written.
