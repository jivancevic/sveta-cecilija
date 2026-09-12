# The Moreškant app (`/app`)

The dancer-facing surface of the roster module ([ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](../adr/0024-moreskant-roster-domain.md); phase 3 = #419). Croatian only, mobile first, no ticketing. Glossary in `CONTEXT.md` → *Moreškant*.

## What ships in phase 3 (#420 → #424)

- Moreškant identity on `Members` and the `Users.member` link (#420).
- The `/app` route group: login, the access decision, the season's performance cards, the PWA manifest (#421).
- **Attendance**: the collection, the answer rules, the army count, Dolazim / Ne dolazim on every card (#422).
- **The performance detail** `/app/izvedba/[id]`: armies against thresholds, on-behalf answers, the army move, the card headcount chip (#423).
- **Invitations** (#424): "Pošalji pozivnicu" on a Member, `/app/set-password`, "Zaboravljena lozinka". Rewritten by #463: the link signs the dancer in and the password is optional.

## What ships in phase 4 (#430, batches A → E)

Each batch has its own section further down; this is the map.

| Batch | Tickets | What it added | Section |
|---|---|---|---|
| A | #431, #435 | Web push: the service worker, per-device subscriptions, the sender, the cron, and notification types (1) alarm and (2) reminder | [Push](#push-431-435--phase-4-batch-a) |
| B | #436, #433 | Notification types (3) change, (4) new performance, (5) withdrawal; the manual alarm; the note edit; the shared calendar feed | [Triggered notifications](#triggered-notifications-436--phase-4-batch-b), [The calendar feed](#the-calendar-feed-433--phase-4-batch-b) |
| C | #432, #437 | **Lineups** with confirmation, and the season **statistics** built on them | [Lineups](#lineups--postave-432--phase-4-batch-c), [Statistics](#statistics-437--phase-4-batch-c) |
| D | #434 | **Self-issued comps**: four free tickets per performance, cancellable | [Self-issued comps](#self-issued-comps-434--phase-4-batch-d) |
| E | #438, #439 | The **MCP server** and its OAuth, so a voditelj dictates a postava to Claude | [MCP and OAuth](#mcp-and-oauth-438--phase-4-batch-e) |

What `/app` itself writes is an attendance row, a push subscription, a lineup, a
comp order, the session cookie and, through the invitation, a dancer's password.
Its raw tables are `push_subscriptions`, `performance_notifications`,
`oauth_codes` and `oauth_tokens` — none of them Payload collections, all of them
in `db/schema/`, each with a probe script.

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

Access follows the **roster, not the login table**: unticking `active` or `isMoreskant` locks a dancer out on the next request without deleting anything (#419, story 16). A voditelj with no Member link is valid (story 15); a `moreskant` with a missing or stale link is denied (story 38). A voditelj who *does* dance fills the link in themselves through `/app/povezi` (#462, below) — the field is locked to `users` and used to need an administrator.

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

### The status bar is the app's to clear (#482)

The `/app` layout pairs `viewportFit: 'cover'` with `appleWebApp.statusBarStyle: 'black-translucent'`, so the installed app's web view starts at y=0 — under the clock and the Dynamic Island. Nothing puts it back: **every root container under `/app` must add `env(safe-area-inset-top)` itself**, the way `.app__shell`, `.app__panel` and `.app__ob` each do, or its first line renders behind the status bar. The same holds at the other end for `env(safe-area-inset-bottom)`, which the fixed tab bar and the shell's bottom padding already carry.

The trap is that none of this shows in a browser, where both insets are `0px`: the bug exists only in the installed app on a notched phone, which is the only place a dancer ever sees it. Verify a new `/app` screen on an installed iPhone, not in a desktop tab.

**The service worker arrived with push (#431) and still caches nothing** — the phase 3 reason (#419, story 47) survives it: a cache layer over server-rendered roster data can only turn app bugs into caching bugs. Details in the Push section below.

### The install flow (#455)

Three facts decide what `/app` offers, and all three live in `src/lib/app/platform.ts` as pure functions over browser facts, table-tested in `platform.test.ts` against real UA strings:

- **`detectPlatform`** → `installed | inapp | ios | android | desktop`. `standalone` wins over every UA. An **in-app browser** (Viber, WhatsApp, Messenger, Instagram, any Android WebView) is its own platform, not a phone: the share sheet it shows belongs to the host app and has no "Add to Home Screen" at any scroll position, so the only useful thing to say there is "open this in Safari". That dead end is the most common way an invitation fails, because a link travels by Viber. iPadOS reports a Macintosh UA, so touch points are the tell.
- **`decideInstallStep`** → `inapp | install | push | on | none`. Read it as one sentence: a device that already rings needs no offer; "Kasnije" buys silence until tomorrow; a webview gets the way out; a browser with **no `PushManager` at all is asked to install**, because on iOS that IS the notification switch; everything else is offered notifications first, because on Android they work in a plain tab and installing is then a one-tap bonus rather than a toll.
- **`INSTALL_PROMPT_CAPTURE`**, injected inline by the `/app` layout ahead of hydration. Chromium fires `beforeinstallprompt` once and never replays it, so a React effect that has not hydrated yet misses it and the one-tap button never appears on the one platform that has one. The script only parks the event on `window`; every decision about it stays in the component.

What this replaced, and why each half was wrong: the old banner asked "push supported?" first, so an Android tab (which always has a `PushManager`) never reached the install offer at all, and the install branch was dead code on the easiest platform; one × wrote a permanent `localStorage` flag, which silenced the banner forever on the iPhone where installing is the precondition for notifications; and one sentence of generic advice served every device, including the webviews where it cannot be followed.

`InstallHint.tsx` renders the decision, `InstallSteps.tsx` the numbered steps (with the iOS share glyph drawn inline, because step one is "find this icon"), and `use-install.ts` holds the browser reads. Every storage and permission access stays wrapped in `try/catch`: a private window, a browser blocking site data and a thumbnail-capture pass can each throw, and none of that may take `/app` down. Whether **this** device is subscribed is still read from the browser, never from the server, and the component renders nothing until it has looked.

The banner asks that question, and every other browser push call, through **`push-client.ts`** (#457): `use-install.ts` re-exports its `pushSupported` rather than restating it, so "can this browser subscribe" has one answer. The split is by subject, not by screen: `platform.ts` + `use-install.ts` own WHICH DEVICE this is, `push-client.ts` owns the subscription and its round trip to `/api/app/push/*`, and the components own only what is said. `InstallHint` carries its own heading ("Instalacija" or "Obavijesti", whichever card it is showing), because whether there is anything to put under one is a fact only it knows.

**The three places that show these instructions are one implementation.** The banner, the Dobrodošlica's first step and `/app/instalacija` all call `readPlatform()` and render `InstallSteps`, all offer the same one-tap `install.action` button when Chromium parked a prompt, and all show the same way out of a webview. There is no second set of install copy anywhere in `/app`.

**`/app/instalacija`** is the same guide full screen, and deliberately **not** behind the access decision: it is the target of the QR code a voditelj puts on the wall at a rehearsal, and the person scanning it has not signed in yet. Its platform switch exists because the voditelj is holding somebody else's phone half the time.

### Why not the App Store or Google Play (#455)

Asked and answered in the same pass, so it does not get re-litigated every season.

- **App Store: no.** 99 EUR/year with no waiver (Apple's fee waiver is limited to a country list Croatia is not on, whatever the RNO registration says), guideline 4.2 "minimum functionality" rejection risk for what is a webview of an existing site, guideline 5.1.1(v) would force an in-app account-deletion flow the roster has no use for, plus an EU DSA trader declaration that publishes the society's address and phone on the store page. Every release would then wait on review, instead of shipping with the site.
- **Google Play: cheap but not free of work.** 25 USD once, and a Trusted Web Activity built by PWABuilder is genuinely just this PWA in a Play wrapper, with `assetlinks.json` on the domain and no review risk (TWA is Google's own mechanism). An organisation account needs a D-U-N-S number, which the society does not have; organisation accounts are exempt from the "12 testers for 14 days" rule, which applies only to personal accounts created after 2023-11-13.
- **What a store would actually buy**: on iPhone, installing from a store listing instead of the share sheet. Nothing else: push already works in the PWA, and on Android the one-tap `beforeinstallprompt` button is the same gesture. That is one screen's worth of difference, which is why the screen got fixed instead.

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
no email — the four things a voditelj can repair themselves. (Since #463 the
last of those is the ONE rule the copied-link channel drops: see
[Passwordless onboarding](#passwordless-onboarding-463).)

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

> **Changed by #463.** The link now opens the session by itself
> (`/app/prijava` → `POST /api/app/session`) and `/app/set-password` is an
> optional row in Više that takes no token. The paragraphs below describe the
> #424 shape and are kept for the three surprises at the end, which still hold.
> The current flow is [Passwordless onboarding (#463)](#passwordless-onboarding-463).

`POST /api/app/set-password` ran Payload's `resetPassword`, which stores the
hash **and opens a session**, so the route set the same cookie the login route
sets and the dancer landed on `/app` signed in rather than on a form asking for
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

### "Poveži svoj račun s članom" (#462)

That lock had one victim: a **voditelj who also dances**. `Users.member` is
locked to `users` for read *and* write, so they could not see the field, let
alone fill it, and `decideAppAccess` handed them `{ kind: 'voditelj', self:
null }` — a state that is perfectly valid for a voditelj who does not dance
(story 15) and indistinguishable from one whose link was never set. They could
not answer their own dolazak and could not appear in a postava, and the only
repair was somebody with `users` editing the row by hand.

`POST /api/app/link-self` is a narrow, permission-checked hole in the lock, not
a relaxation of it. Do not widen the field access to achieve the same thing: the
lock is why a dancer cannot repoint themselves at another dancer. The rules are
pure in `src/lib/app/link-self.ts`; the route is the IO shell, and
`src/lib/app/link-self-data.ts` builds the screen's list through the same
`memberEligibility` the POST re-applies, so a hidden line and a refused tap are
one rule rather than two that can disagree.

What keeps it narrow:

| Rule | Why |
|---|---|
| `requirePermission(req, 'moreska')` first, then the cross-site guard | the local API runs `overrideAccess: true`, so this handler's check is the only thing standing in for the field lock it bypasses |
| a `shared` login is refused (403) | a login several volunteers hold is nobody in particular, so "this is me" has no answer (ADR-0022). `Users.access.update` says the same thing, and this route bypasses it |
| the caller must have **no** link yet (409 otherwise) | repointing an existing link stays a `users` job. A self-edit path that can *move* a link is exactly what the lock exists to prevent |
| the target must be `active` + `isMoreskant` | the same bar `decideAppAccess` applies to a dancer identity |
| **no other login may point at that Member** (409) | linking to a dancer who already has an account is taking over their identity, not filling in a blank |
| the write is `member` + `permissions ∪ {moreskant}` | filling in a missing link never widens what an account may do |

The exclusivity check runs **twice**, before the write and after it, because
between the two a second voditelj can claim the same Member; losing that race
un-links rather than leaving two logins on one dancer. A unique index on
`users.member` would be the stronger guard and is deliberately not there:
the column has carried hand-set values since #420, and a bootstrap index that
fails on legacy data is a worse outage than a race nobody has run yet.

The screen is `/app/povezi`, reached from the hero on `/app` (where the two
answer buttons are missing, which is the moment the gap is felt) and from Više
(which survives the end of the season, when there is no hero). Both links are
quiet and both are shown only to a voditelj whose **raw link** is empty: a
voditelj who does not dance must not read them as something they are late on,
and one whose link points at a retired Member must not be sent to a list whose
every tap is refused. Gate an entry point on `viewer.memberLinkId`, never on
`accessMember(...)`, which is also null in that second case.

`AppViewer` carries `memberLinkId`, the **raw** `Users.member` value, alongside
the decision. The decision deliberately collapses "no link" and "a link to a
retired or un-flagged Member" into the same `self: null`, which is right
everywhere that asks "is there a dancer here"; `/app/povezi` asks the other
question — may this account still be linked at all — and without it would offer
a list whose every tap 409s.

### "Pošalji pozivnice svima" (#462)

The list-view half of the same gap: the per-Member action (#424) leaves a
voditelj to read the "Ima prijavu" column down forty rows and open each miss by
hand. `POST /api/app/invite/all` does it once, for every active moreškant with
an e-mail and no login.

It adds **no invitation rule of its own**: it loops `handleInvite` over the
batch, so the four refusals, the idempotent reverse lookup and the seven-day
link stay written once. The Payload wiring both routes need moved into
`src/lib/app/invite-data.ts` for that reason — two hand-copied sets of calls is
how "the Member's e-mail wins" ends up true on one route and not the other.
`src/lib/app/invite-all.ts` holds the only two decisions that are the bulk
action's own: who is in the batch, and what the toast says.

The toast **names** the dancers of both bad outcomes rather than counting them,
and the failed ones are the reason why: `handleInvite` creates the login before
it mails, so a send that fails leaves an account behind, and the next bulk press
sees a Member that "already has a login" and skips it for good. A count would
strand those dancers silently. The names send the voditelj to the per-row
"Pošalji pozivnicu", which is idempotent and does re-mail them.

### An invitation may not be aimed at a staff login (#462 review)

A second press MOVES the found login's e-mail onto the Member's and mails that
address a password-reset link. On a dancer that is the point: it is how a lost
letter is fixed. On a login that holds more than `moreskant` it is an account
takeover, because **any** voditelj may edit a Member's e-mail — so pressing
"Pošalji pozivnicu" on a Member whose login is a colleague's staff account would
send that colleague's reset link wherever the presser chose.

`isDancerLogin` (`src/lib/app/invite.ts`) is the guard: it refuses with a 409
before the e-mail move and before any token is minted, unless the login holds
nothing beyond `moreskant`. An empty permission set passes — a row from before
the vocabulary is still not a staff account.

The hole predates this work (a `users` holder could always hand-link a staff
account), but `/api/app/link-self` is what makes such links routine, so the
guard ships with it. The bulk action is not a vector: it skips every Member that
already has a login.

Sends are sequential (Brevo's free tier is 300/day and rate-limits a burst; tens
of dancers is a second of wall clock). The menu item is on Members'
`listMenuItems` and hides itself from the ticketing backoffice through the field
lock rather than through a permission list: `isMoreskant` locks read to
`moreska`, so a `tickets`-only account receives rows with no such key
(`inviteAllActionVisible`). As always that is UX; the route re-checks `moreska`.

## Passwordless onboarding (#463)

The last of the three onboarding changes (#455 install flow, #462 voditelj
self-link, this). It changes what AUTHENTICATES in `/app`, so read this before
touching anything under `src/lib/app/{token-login,session-data,join}*.ts`.

The numbers it was built against, from production on 2026-09-12: **76
moreškanti, 70 active, one e-mail address between them, one dancer login.** Every
decision below follows from that line.

### The link opens a session; the password is optional

`/app/set-password` ran Payload's `resetPassword`, which stores a hash **and
opens a session**. So the password step was never what signed anybody in: it was
a toll on the way to a session the token had already earned. Since #463:

- both mails and "Kopiraj pozivnicu" point at **`/app/prijava?token=…`**
  (`signInLink`, one builder, `invite.ts`);
- that page opens nothing itself. It renders, and a client island POSTs the
  token to **`POST /api/app/session`**. The reason is that a link in a letter is
  fetched by mail scanners and preview bots: they do not run a page's scripts
  and post JSON back behind a `Sec-Fetch-Site` check, so the session cannot be
  spent before its owner opens it;
- the session is minted by `openAppSession` (`session-data.ts`) out of Payload's
  own public helpers — `addSessionToUser` → `getFieldsToSign` → `jwtSign` →
  `generatePayloadCookie`, exactly what `resetPassword` does after it writes the
  hash. **Nothing here re-implements a crypto decision**, and nothing touches
  the password: "pošalji mi link za prijavu" must not silently replace a
  password somebody does use;
- **"Postavi lozinku" is now a row in Više**, takes no token, asks for no
  current password (there frequently is none, and the caller is already holding
  a live session on this device, which is strictly more than a password proves)
  and refuses a `shared` login (ADR-0022, re-checked in the handler because the
  route runs `overrideAccess: true`);
- the login screen's second line is **"Pošalji mi link za prijavu"**, over the
  unchanged `/api/app/forgot` path: same token, same throttle, same deliberate
  silence, different letter.

Four rules keep `POST /api/app/session` narrow (`token-login.ts`, table-tested):
the cross-site guard; **one sentence** for a token that is unknown, expired or
malformed, because for the person holding it they are one situation; a 403 for a
`shared` login; and a 403 for an account that has no `/app` — a `tickets` or
`door` login resets its password in `/admin`, and this is not a second door into
the backoffice.

**The token is NOT spent on use**, and that is the one decision here worth
arguing with. It lives its natural life instead (seven days from an invitation,
one hour from a sign-in link). Single use reads safer and is wrong for this
audience: the invitation arrives as an SMS, the dancer opens it in whatever
browser the phone hands them, and half the failures #455 exists to fix end in
"open this in Safari instead" — which is a SECOND tap on the same link. Burning
it on the first tap would turn the app's most common recovery into a dead end.

**A `moreskant` login no longer requires an e-mail** (`user-email-policy.ts`).
It did from #420, because the invitation WAS an e-mail. The requirement was not
protecting anything by 2026: it was refusing a login to 75 of the 76 moreškanti
on the roster.

### "Kopiraj pozivnicu": the invitation travels by SMS

`POST /api/app/invite` refuses a Member with no address, which is nearly all of
them. `POST /api/app/invite/link` is the same invitation handed to the voditelj
instead of to Brevo.

Both go through **`mintInvitation`**, and the account half of that is
**`ensureDancerLogin`** — the one place that says what a dancer's login IS (the
`['moreskant']` bundle, the `member` link, the slugged username, the unusable
random password, the takeover guard). Three callers depend on it now: the mail,
the copied link and a voditelj approving a join claim. The channel changes
exactly **one** rule: whether a missing address is a refusal.

`/app/pozivnice` is the voditelj's screen, on the phone they are already
holding: every active moreškant, the ones without a login first, one tap to mint
a fresh seven-day link, then the message in full with SMS, WhatsApp and Kopiraj
under it. The message is **shown** rather than silently copied, because the
voditelj is about to leave for Messages and should see what they are sending. A
dancer who already has a login stays on the list, under a disclosure: re-issuing
is the whole answer to a lost phone. "Kopiraj pozivnicu" is also an edit-menu
item on a Member, for the desktop `/admin` where `sms:` does nothing.

**Send it by SMS, not WhatsApp and not Viber, and the UI says so.** A messenger
opens a link in its own in-app browser, where "Add to Home Screen" does not exist
at any scroll position; Messages hands it to Safari, where it does. That is the
dead end #455 built a platform detector to rescue people from, and this is the
half that stops them falling into it. `invite-link.ts` holds the two phone rules
that follow: a Croatian mobile in the digits `wa.me` insists on (a leading `0`
is read as Croatian, the one guess made, and an unreadable number falls back to
a composer with no recipient), and the `sms:` separator the platforms disagree
about — **iOS wants `&`, Android wants `?`**, and each ignores the other's
silently, which is how a composer opens with an empty body.

### `/app/join/<kod>`: the rehearsal QR

For the dancer with no e-mail and no number on file. A voditelj shows a code
(QR on `/app/pozivnice`, or a printed sheet), the dancer taps their own name,
and a voditelj approves with one tap; the dancer's phone then drops into `/app`
signed in.

**A human approves, a code does not verify.** No SMS gateway: it costs money and
proves the wrong thing, because what matters is that this is the right person,
and the voditelj standing in the room knows their face. So the code opens a
QUEUE, not a door — which is also what makes it safe to print.

| Piece | Rule |
|---|---|
| the code | 12 hours, rotatable, drawn from an alphabet with no `0`/`O`/`1`/`I`/`L` (it is read off paper across a hall). Stored in the CLEAR, unlike the OAuth credentials next door: it is printed on a wall, it is not a secret |
| "Novi kod" | kills every live code, then issues one. That IS the rotation: a voditelj presses it because yesterday's QR is on somebody's camera roll |
| the page | public like `/app/instalacija` and for the same reason, but it WRITES. Names only — no mobile, no e-mail, no roles (`getJoinCandidates` is where that projection is stated) |
| who is listed | active moreškanti with no login, which is `memberEligibility` (#462), not a second definition |
| one claim | a **partial unique index** on `member_id WHERE status='pending'`, so two phones cannot queue one dancer twice and mint two logins. The route reads the refusal as "somebody already asked" |
| the claim secret | the device's credential: httpOnly cookie (`Path=/`, both halves of the flow need it), SHA-256 in the database, spent BEFORE the session is minted. `markJoinClaimUsed` REPORTS whether this call is the one that spent it, and a caller told "no" opens nothing — the phone's poll is a plain `setInterval` that does not wait for its own last request, so on a bad connection two overlap |
| the pairing number | three digits on the waiting phone and beside the name in the queue. Approval is a tap on a NAME, which is exactly what a stranger holding the code can also tap; the number is how the person in front of the voditelj proves the waiting phone is theirs. The server never checks it — it is a check between two people — and it rides back with a pending status so a reloaded phone can still read it out |
| the approval | takes the claim ATOMICALLY first (`status='approving'`), then re-checks eligibility, then creates the login. Both halves matter: without the atomic take, two voditelji a second apart both find no login and both create one (there is deliberately no unique index on `users.member`), and without the re-check an approval minutes later can mint a second account for a dancer who was invited by SMS in the meantime. Every refusal after the take hands the claim back |
| a claim nobody answers | is marked `expired` lazily, by whoever trips over it: the dancer's next claim sweeps it, and a voditelj's late tap marks it. That is not tidying — a `pending` row past its expiry still counts against the partial unique index, so leaving it would lock that Member out of the join flow **for good**, and a stranger with a live code could do that to the whole roster in one pass (#463 review) |
| the throttle | sized for the room: a hall of dancers is ONE NAT, so 60/hour per IP and 200/hour per code (`join-rate-limit.ts`). A blocked caller is told plainly, unlike `/api/app/forgot` — whoever holds a live code is already looking at the list |

Two raw tables, `app_join_codes` and `app_join_claims`
(`db/schema/migrate-zz-db-join.sql`), for the ADR-0024 reasons the push and
OAuth tables follow. `scripts/probe-join-schema.mjs` proves the partial index,
the unique secret, both cascades and the restart/upgrade paths against a real
throwaway Postgres; the pure rules are `join.ts` + `join.test.ts`, the SQL is
`join-store.ts`, and the Payload half is `join-data.ts`.

The dancer's page **asks for its own status before it renders anything**, so a
phone that reloaded, or was locked and reopened, rejoins the wait instead of
being shown the list and refused with "somebody is already waiting for this
name" — which was itself, one minute earlier (#463 review).

**Recovery, when something goes wrong mid-flow**: the failure that leaves a
trace is an approval whose login was opened but whose claim write failed. The
voditelj is told exactly that, and the fix is the row below on the same screen —
that dancer now HAS a login, so "Kopiraj pozivnicu" reaches them. The same
sentence covers a phone that lost the session cookie after approval.

## Push (#431, #435 — phase 4 batch A)

Web push is the **only** notification channel (ADR-0024): no email, no SMS. What
ships here is the plumbing plus two of the five notification types — the
**alarm** (1) and the **T-48h reminder** (2). Types (3), (4) and (5) are #436,
the next section.

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

`InstallHint.tsx` is the one banner (#430 stories 1-3), which since #457 lives
in the Više tab and carries its own heading: unsubscribed and able to
subscribe → "Uključi obavijesti"; already subscribed → one muted line with the
per-device off switch, which is the whole of the per-device control (story 5).
Which of those it asks, and whether it asks about installing first instead, is
`decideInstallStep` in `src/lib/app/platform.ts` — see [the install flow](#the-install-flow-455)
for why the order is per platform rather than fixed (#455).

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

## Self-issued comps (#434 — phase 4 batch D)

"Besplatne karte" on `/app/izvedba/[id]`: a dancer issues up to **four** free
tickets per performance for their own family and cancels them again while the
evening has not begun. Glossary: `CONTEXT.md` → *Moreškant comp*.

**It is not a second ticket writer.** `POST /api/app/comp/issue` calls the same
comp engine `/api/comp/issue` calls (`src/lib/comp/create-comp-issue.ts`), under
the same per-show advisory lock, with the same order code, the same QR tokens
and the same ticket e-mail with the PDF (#430, story 54). What `/app` adds is
`member` forced to the caller's Member, `compIssuedBy: 'self'`, and the cap.
Cancel reuses the void primitive whole-order (`voidOrderTickets`, reason
`storno`), so the seats come back the moment the tickets go inactive — seats are
COUNT(active tickets), the same self-healing the refund cascade relies on.

- **`orders.compIssuedBy`** (`admin | self`, nullable, **no default at all**) is
  the only thing that tells the two kinds of comp apart. A default of `admin`
  is exactly what the migration goes out of its way to avoid — it would label
  every future online and partner order as an admin comp, and `ADD COLUMN …
  DEFAULT` would have stamped it on every Stripe purchase already in the table;
  the file even drops a default an earlier revision might have left behind.
  NULL therefore means "not a self-issued comp" and is *read* as `admin`, but
  it is never written. Only the literal `'self'` counts against the four, which
  is story 52 — a voditelj's gift never eats a dancer's own allowance. It is a
  column in the `/admin` Orders list (story 53). Migration:
  `db/schema/migrate-zz-c-orders-comp-issued-by.sql` (the `-c-` is a sort key,
  the `-b-lineups` convention), probe `scripts/probe-comp-issued-by.mjs`.
- **The cap is counted inside the sell lock.** The route passes a `guard` into
  the engine's `withSeatLock`, so the dancer's tally
  (`getSelfCompTicketCount`) and the room's capacity are read under one lock and
  the tickets are written before it is released. Two taps queue; they cannot both
  read "three issued". Proven in `self-comp.test.ts` with a serialising fake.
- **The refusals are one sentence each**, in `strings.ts` and spoken by both the
  section and the routes: no Member link (403, story 55 — a voditelj who does
  not dance sees no section at all), no Member e-mail (400, there is nowhere to
  send the PDF), a non-public performance (400 — it sells no seats, ADR-0024),
  cancelled (400), already started (409), the cap (409), no seats left (409).
  The **online sales pause is deliberately not checked**, which matches
  `/api/comp/issue`: the admin comp route does not check it either, and a comp
  is not an online sale. A voditelj who truly wants comps stopped cancels the
  performance or lets the room fill.
- **The gate is `requirePermission(req, 'moreskant')` plus the access
  decision's Member resolution** (`resolveOwnMemberId` → the Member row →
  `isActiveMoreskant`), so a retired dancer is refused for the same reason they
  cannot open `/app`. Both routes carry `appRequestMeta` + `rejectAppRequest`
  like every other `/app` POST (403 cross-site, 415 non-JSON).
- **Cancel is whole-order, own, self-issued, unscanned, before the start.** A
  single ticket, or a voditelj cancelling someone else's comp from `/app`, are
  out of scope and stay in `/admin`. A scanned order refuses with 409: someone
  is already inside on that slip, and voiding it would free a seat that is
  physically taken.
- **Cancel answers ONE 404** for every order that is not the caller's own
  self-issued comp — missing, paid, an admin comp, someone else's. Three honest
  statuses would be an oracle: a dancer walking the order ids would learn which
  exist, which are comps and whose they are. The tickets and the evening are
  read only *after* ownership holds (`loadSelfCompCancelContext`), and an
  evening that cannot be read refuses rather than voids.
- The section's `visible` flag lives in the loader (`buildCompView`), not in the
  template, so a non-public or past evening cannot leak an issue button through
  a forgotten condition — and the hidden case carries no orders in the payload
  at all. A full room keeps the section and loses the form: a comp holds a real
  seat, so `remainingSeats` (the same arithmetic `/tickets` uses) decides
  whether there is anything to give.
- **`compIssuedBy` is editable in `/admin`** by a `tickets` holder, unlike the
  `member` / `partner` attribution links beside it: switching a dancer's comp to
  `admin` is how the backoffice gives them their four back on purpose.

## MCP and OAuth (#438 — phase 4 batch E)

A voditelj photographs the paper list on the pier, Claude reads the photo in the
chat and calls a tool with the nicknames. That sentence is the whole reason this
server exists (ADR-0024), and it decides everything below: **the tools take
structured text, never an image**, and the matching is exact.

### Connecting

A voditelj adds **`https://moreska.eu/api/mcp/mcp`** to the Claude app, the
full URL. The doubled segment is two different things: `/api/mcp` is our route
folder, and the trailing `/mcp` is the Streamable HTTP transport that
`mcp-handler` serves under its base path (the `[transport]` folder; `/sse` would
be the other one, and it is disabled). The Claude app does **not** append that
segment: typed as `/api/mcp`, OAuth still succeeds (discovery is per host) and
the connector then fails with "no MCP server was found at the provided URL"
(verified 2026-09-11 on prod). The full URL is also the RFC 9728 `resource`.
In the connector dialog choose *Use your own OAuth client*, client ID
`MCP_CLIENT_ID` (`claude`), secret blank. From there the dance is the standard
one and every step is a file:

| Step | Where |
|---|---|
| 401 with `WWW-Authenticate` naming the metadata | `src/app/api/mcp/[transport]/route.ts` (via `withMcpAuth`) |
| Protected-resource metadata | `src/app/.well-known/oauth-protected-resource/route.ts` |
| Authorization-server metadata | `src/app/.well-known/oauth-authorization-server/route.ts` |
| Consent screen | `/app/authorize` (`src/app/app/authorize/page.tsx`) |
| Consent decision | `POST /api/app/authorize` |
| Token exchange | `POST /api/oauth/token` |

The rules are `src/lib/mcp/oauth.ts`, pure over an injected store, ported from
Sufler with **the refresh path deleted**. Four differences from that original,
each deliberate:

- **The token lives a year and there is no refresh grant** (#430, story 59). A
  connection has to survive a season, and a refresh flow is a second set of
  rules to get wrong for nothing.
- **The client is public: identified, not authenticated.** Claude's connector
  holds no secret it could keep, so there is no `MCP_CLIENT_SECRET` and PKCE
  S256 is the proof that the party redeeming a code started the flow.
  `MCP_CLIENT_ID` plus the exact-match `MCP_REDIRECT_URIS` allow-list pin it. An
  allow-list rather than a prefix test, because a prefix match on
  `https://claude.ai/` accepts every path on that host and hands the code away.
- **The subject is a Payload user id**, not an e-mail: the consent screen already
  runs behind the `/app` cookie, and the id is what the route re-reads per call.
- **Codes are hashed at rest too**, not only tokens. A code lives five minutes,
  but there is no reason for the database to hold a credential in the clear.

Single use is a property of one statement rather than of the caller: `takeCode`
is a `DELETE … RETURNING`, so two redemptions of one code race inside Postgres
and only the one that removed the row sees it. A wrong verifier still consumes
the code.

How a connector is **revoked** is an ops question and lives in
`deployment.md` → *Env vars*.

### The consent screen

`/app/authorize` lives in the `/app` route group, so it is already behind the
same session cookie as the rest of the app: a voditelj with `/app` open sees one
sentence and one button and never types a password (story 57). Three cases, in
order — no session → `/app/login?next=<this url, parameters and all>`; signed in
without `moreska` → the "Nemate pristup" page (story 58); a valid request →
"Dopusti pristup" / "Odbij".

- **The `?next=` rule is `src/lib/app/next-path.ts`**, and it is narrow on
  purpose: only `/app` or `/app/…`, never `//host`, never a backslash, never a
  path elsewhere on the site. It is resolved on the SERVER and handed to the
  form as a prop, so a hostile value never becomes a redirect target in the
  browser.
- **The consent POST is JSON through the `/app` cross-site guard**, not a form
  action. Issuing an authorization code from a cross-site form with the
  visitor's cookie is exactly what that guard exists for, and requiring
  `application/json` is what a plain HTML form cannot satisfy.
- **The route re-validates** everything the page rendered
  (`parseAuthorizeRequest`, shared by both), because a form's values belong to
  the browser. An absent `decision` is a refusal, never consent.
- A refusal is **200 with a redirect** carrying `error=access_denied`: that is
  what the OAuth client is waiting for, and only a request that is not ours at
  all refuses locally.

### The gates on every call

1. **The access check.** The one sentence, and the 401/403 split it implies,
   belongs to `permissions.md` → *An MCP token acts as its user*. The mechanics
   are `src/lib/mcp/gate.ts`: `mcpAuthScopes` stamps the permission onto the
   token's scopes at verification time and strips any stored copy first, so a
   scope can never stand in for the permission; `isMissingUserError` is what
   keeps a database hiccup from reading as "you are no longer a voditelj".
2. **The audience.** A token is bound to this deployment's MCP URL (RFC 8707)
   and the binding is COMPARED on every call: a consent naming a different
   `resource` is refused outright, every code is bound to ours, and a token
   whose stored resource is not ours does not verify. Stored-but-unchecked
   would be decoration, and it is also what keeps a caller-supplied string from
   ever reaching `new URL()`.
3. **The rate limit**: `src/lib/rate-limit/mcp-rate-limit.ts`, 120 calls a
   minute in the `forgot-rate-limit.ts` shape, keyed on the token's ROW ID and
   taken only AFTER the token verified. A key derived from an unverified bearer
   would let a loop of random strings mint one key per request; the window log
   evicts stale keys either way, but this way the set of possible keys is
   exactly the set of issued tokens. Unlike the forgot route this answers an
   honest **429**: the caller is authenticated and already knows it exists, and
   a model told "too many requests" waits, while a silent success makes it
   retry.
4. **Nothing else.** No tool confirms a lineup, sends an alarm, answers
   attendance or issues a comp (story 63). Those stay taps in the app.

### The five tools

Pure functions over a DI'd store (`src/lib/mcp/tools.ts` + `store.ts`), the
`roster-loaders` / `roster-data` split; the route is wiring.

| Tool | Answers with |
|---|---|
| `list_performances({ season? })` | the season's evenings (public and not) with date, time, kind, place, cancelled, `lineupConfirmed` and the army headcounts |
| `get_performance({ id })` | one evening, its attendance answers, who has not answered, and the postava in reading order |
| `list_moreskanti()` | the roster with roles and whether a login exists |
| `set_lineup({ performanceId, entries })` | `{ written, unmatched, warnings }` |
| `create_performances({ rows })` | `{ created, rejected }` |

- **`set_lineup` never guesses** (story 61). Nicknames are matched through
  `normaliseNickname` on both sides — the SAME normaliser a dancer's username
  comes from (#424), so "Ćići", "cici" and " CICI " are one key and `Đuro` can
  never become `uro`. It is deliberately the bare normaliser rather than
  `usernameFromNickname`, whose `moreskant` fallback would make every
  symbol-only nickname the same person. A name it cannot match comes back in
  `unmatched`, and one that matches **two** active dancers in `ambiguous` —
  neither is written, because keeping the last one found would make the answer
  depend on the roster's sort order. The rest is still written: a partial
  postava plus a question beats a wrong record. Refusals are whole-call and each
  means the request itself is wrong: an unknown performance, a role outside the
  vocabulary, a **confirmed** evening (press Otključaj first), and *nothing
  matched at all* — blanking a real postava because the photo was unreadable is
  the worst outcome available.
- **What it writes is always UNCONFIRMED** (story 62), through
  `replaceLineupInTransaction` — the same row lock, the same transaction, the
  same 409 as `POST /api/app/lineup`. A lineup dictated to Claude and one typed
  on the phone cannot race into two different postave.
- **`create_performances` cannot create a `redovna`.** A Redovna is public: it
  needs a venue, it sells tickets, it appears on `/tickets`, and the backoffice
  creates a season of them from a date range. A tool that made one from a chat
  message would be one typo away from a ticket on sale for an evening nobody
  planned. The zod enum refuses it before the tool runs and the tool refuses it
  again, with a sentence pointing at `/admin`.
- **A bad row rejects the whole batch, and so does a failed write.** Half a
  pasted calendar is harder to fix than none of it, so the rows are validated
  first (the collection's own `validateAndNormalisePerformance`, plus a
  calendar-day check — `2026-02-31` matches the shape and would otherwise become
  3 March on the way through `Date`) and the caller gets every correction at
  once. What is written goes through `createPerformancesInBulk`
  (`src/lib/performance-bulk-create.ts`), shared with `/api/shows/bulk-create`:
  ONE transaction, the per-create `skipRosterPush` flag and the ONE summary push
  (#441 review) are stated once, so a season entered from Claude behaves exactly
  like a season entered from `/admin` and a create that throws on row nine
  leaves nothing behind.
- **The PII boundary holds here too**: `toMcpMoreskant` is an explicit
  projection with no mobile and no e-mail (ADR-0024, the `toAppMember` rule). A
  chat window is the last place to relax it.
- The shows reads carry no public predicate, for the roster reason every other
  `/app` reader carries — `src/lib/mcp/store.ts` is on the
  `show-performance-guard` allow-list with that justification.

### Schema

`db/schema/migrate-zz-d-oauth.sql` (probe: `scripts/probe-oauth-schema.mjs`).
The `-d-` is a **sort key, not a word** — the `-b-lineups` / `-c-orders-…`
convention: both FKs reach only `users`, so the file just has to land before
`migrate-zz-drop-users-role.sql`, which must stay the last `migrate-*` file
(#398). `oauth_codes` and `oauth_tokens` are raw tables and must stay out of the
regenerated `00-base.sql`.

## Redesign (#457)

No schema change, no new route handler: the same reads, rearranged into three
tabs plus a walkthrough.

### The tabs

A fixed bottom bar (`TabBar.tsx`, one client island inside the server
`AppShell`) over three pages. `activeAppTab` (`src/lib/app/tabs.ts`) is the
single rule for which tab a path lights up, so a page below a tab lights its
parent.

| Route | Tab | What it is |
|---|---|---|
| `/app` | Izvedbe | the next live evening as a hero, then the season by month, the past behind a disclosure |
| `/app/izvedba/[id]` | Izvedbe | one evening, three segments, the two answer buttons pinned above the bar |
| `/app/moje` | Moje | two panels: the dancer's own season, and the Ljestvica |
| `/app/vise` | Više | statistics, the Dobrodošlica replay, the install guide, notifications, calendar, own record, Odjava |
| `/app/statistika` | Više | the season scoreboard, unchanged |
| `/app/dobrodosli` | none | the walkthrough: no bar, no brand header |
| `/app/instalacija` | none | the full-screen install guide (#455), public by design: the QR target at a rehearsal |

**The hero rule**: `pickNextPerformance` (`roster-loaders.ts`) picks the next
evening that is **not cancelled**. A cancelled evening is never the hero, and it
is never skipped from the month list either: it stays there, struck through, so
a dancer who remembers a date finds it and reads why. The month heading counts
only the rows that are still happening. The season's own count of evenings is
the list; nothing on `/app` re-counts it.

### `?dio=` — the segment params

Two screens carry a segmented control, and both state the vocabulary in a pure
parser rather than in the component: `parseSegment` →
`dolaze | postava | ulaznice` (`src/lib/app/detail-view.ts`) on the performance
detail, `parseMojeSegment` → `moja | ljestvica`
(`src/lib/app/leaderboard-loaders.ts`) on Moje. Every panel is server-rendered
and handed to the client component as a child; switching costs no request and
follows along in the URL through `history.replaceState`, never a navigation. On
the detail screen all three panels stay in the DOM and the inactive two carry
`hidden`, so the voditelj's lineup draft and the Ulaznice steppers survive a
glance at another segment.

**Nothing sends a `?dio=` link today.** Confirming a postava deliberately rings
nobody, so `?dio=postava` is reserved for a future deep link rather than wired
to a push that exists. The tab labels and the URL values are still read off one
object (`APP_STRINGS.detail.segments`) so that when something does send one, the
word on the tab and the value in the link cannot have drifted apart.

### The Dobrodošlica cookie rule

Glossary: *Dobrodošlica*. Remembered **on the device only**, never on the
account, as two things that back each other up:

1. **The cookie, set by the server.** `POST /api/app/onboarding/done`
   (`src/app/api/app/onboarding/done/route.ts`) answers 204 with
   `Set-Cookie: moreskant_onboarded=1; Path=/app; HttpOnly; SameSite=Lax; Max-Age=31536000`
   (plus `Secure` when the request arrived over https). A **one-year** cookie
   has to come from a header: Safari's ITP caps a `document.cookie` write at
   seven days, so a browser-written one would quietly become "next week" and
   walk a dancer through the same three steps every Monday. The route sets a
   cookie and nothing else, and still carries the full `/app` gate — the
   cross-site check (`rejectAppRequest`) first, then
   `requirePermission(['moreskant', 'moreska'])`.
2. **`localStorage['moreskant.onboarding.done']`, the rescue.** The client
   writes it when the walkthrough ends and reads it **on mount** of
   `/app/dobrodosli`: a device that has seen the walkthrough but lost its cookie
   (expired, cleared with the site data, a private window) re-POSTs for a new
   one and goes straight to `/app`.

The names, the cookie string (`onboardingCookie()`) and the redirect rule live
in `src/lib/app/onboarding.ts`.

`needsOnboarding({ signedIn, denied, hasMember, cookiePresent })` is pure and
tested, and **`/app` is the only page that calls it**. Every other page under
`/app` opens on what it says it is: a push deep-link into tonight's postava must
not land on a walkthrough. Its four inputs are read off the viewer before the
page's early exits and acted on after them, so the rule answers the signed-out
and denied cases itself rather than being handed a hard-coded `false`.
Finishing and skipping ask for the same cookie, so "Preskoči" is an answer
rather than a deferral; the page itself never sets it on arrival, which is what
makes the Više row a harmless replay.

Step 1 (home screen) is left out when `readPlatform()` answers `installed`,
step 3 (calendar) when the deployment has no feed URL. The first render is the
full list on both sides so hydration stays quiet, and an effect narrows it after
mount.

**Step 1 IS the #455 install guide**, not a second one: the same
`readPlatform()` decision, the same `InstallSteps` list, the same one-tap
"Instaliraj" where Chromium parked a `beforeinstallprompt` (with "Dodao sam" as
the primary where it did not), and the same way out of a Viber webview instead
of steps that cannot be followed there. Under it sits a quiet "Detaljne upute"
to `/app/instalacija`, the full-screen version and the QR target at a rehearsal,
which is also a row in the Više tab.

Step 2 runs the REAL subscribe flow: every browser push call lives in
`src/app/app/push-client.ts`, shared with the Više switch, so the two screens
cannot drift into two notions of "subscribed".

Step 3 hands the calendar over **per platform** and never on a timer: on iOS the
primary button is "Pretplati se na kalendar" (`webcal://`, which leaves the
browser for the calendar app), everywhere else it is "Kopiraj link" beside the
sentence naming the three taps in Google kalendar. Either way the step waits for
the dancer to come back and the primary becomes "Dalje"; "Ne sada" is always
there.

### The Ljestvica

Glossary: *Ljestvica* — that entry is the rulebook, this is where it is
implemented. `buildLeaderboard` (`src/lib/app/leaderboard-loaders.ts`) is pure
and sits **downstream of `loadSeasonStats`**: it ranks the scoreboard's own rows
rather than re-deriving a count, which is what keeps `/app/statistika`,
`/app/moje` and the board from ever printing three numbers for one season.

- Only confirmed lineups count (already true of `SeasonStats.rows`), every
  active moreškant is a row even at zero, and the incoming order (performances
  desc, then nickname) is never re-sorted.
- **Competition ranking**: equal counts share a rank and the next rank skips
  (1, 1, 3).
- `share` is the count over the season's confirmed performances (0 when there
  are none); `fullSeason` means it equals them and there was at least one;
  milestones are 5, 10, 15, 20 read off the same count. No streaks.
- `me` carries `toNextPlace` — how many more performances would reach the next
  higher distinct count, null at the top — together with `nextPlace`, the rank
  that count already holds, and the next milestone. `nextPlace` is **not**
  `rank - 1`: with ranks 1, 1, 3 the dancer at 3 reaches 1 by tying, and 2 is a
  place nobody holds. The sentences built from it go through `pluralize`
  (`roster-loaders.ts`), the one home of the three Croatian plural buckets.
- The bottom of the list gets **no** treatment: no red, no "zadnji". An empty
  season hides the card and the podium and says so once.
