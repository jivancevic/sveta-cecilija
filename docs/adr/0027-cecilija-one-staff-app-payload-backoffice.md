# ADR-0027: Cecilija — one staff app on one host; Payload admin becomes a dev-only Backoffice

**Status:** Accepted
**Date:** 2026-09-12

Charted and decided under the wayfinding map [#471](https://github.com/jivancevic/sveta-cecilija/issues/471). This ADR records the shape of the effort; the per-screen acceptance lists live on the map's build tickets, and the route table lives in `docs/agents/moreskant-app.md` (*Cecilija route map*).

## Context

[ADR-0023](./0023-permissions-replace-roles-app-surface.md) decision 3 made `/app` the primary staff surface and left Payload admin as "backoffice", screen by screen, with no date and no name for the end state. A year of that drift is worse than either extreme: two half-surfaces, each missing what the other has, and a secretary who has to know which one holds today's task.

Three things forced the question in September 2026. The roster app ([ADR-0024](./0024-moreskant-roster-domain.md)) put real non-technical people on `/app` daily and proved the shell works. The access model stopped being a tier ([ADR-0023](./0023-permissions-replace-roles-app-surface.md)), so "which screens does this person get" is now a set question that Payload's sidebar cannot express. And a push to `main` now deploys straight to production ([ADR-0026](./0026-production-auto-deploy-from-main.md)), so a long-lived half-migration is a long-lived production risk.

The app was also still called *Moreškant* while it was about to host orders, refunds, the door and partner sales, none of which a moreškant touches.

## Decision

**1. One app with one name: Cecilija, at `moreska.eu/app`.** Every member and staff person works there: the secretary, the door crew, the partners, the voditelji and the moreškanti. v1 is reached when nobody but the developer opens `/admin`. Anything named after the *product* takes the name Cecilija; anything named after the *section* or the *person* keeps "moreškant" (the `moreska` and `moreskant` permissions, the dancer's profile, the roster's tab and its alarm). "Cecilija" declines as a Croatian feminine noun in every string. The word **admin** is retired as a surface name, because for months it would have meant both surfaces; the raw-edit surface is the **Backoffice**. Vocabulary in `CONTEXT.md` (*Product surfaces*), rebrand inventory in [#477](https://github.com/jivancevic/sveta-cecilija/issues/477), shipped by [#489](https://github.com/jivancevic/sveta-cecilija/issues/489).

**2. One host and one deploy; no vanity host is required.** Cecilija is a route group inside the same Next.js app and the same Coolify service as the public site, not a second container, monorepo or repository. Splitting was ruled out: the two surfaces share one database, so the "an app outage must not stop ticket sales" argument buys nothing, and a three-minute build does not pay for double CI. `app.moreska.eu` is optional polish, not part of the address: the redirect ships in code (`src/lib/app-subdomain.ts` via `next.config.ts` `redirects()`, never a hand-written Traefik label, which Coolify regenerates away) and sits **inert while the host does not resolve** ([#479](https://github.com/jivancevic/sveta-cecilija/issues/479)). Turning it on is one DNS record plus one Coolify domain, in `docs/agents/domains.md`. Revisit the split only after a real incident where app traffic slowed ticket sales, or a build over ten minutes.

**3. One responsive app, not a phone app plus a desktop app.** The same routes serve a bottom tab bar on the phone and a sidebar on the laptop. A person's first four unlocked screens are tabs and the rest live under **Više**; Izvedbe jumps to the front for a `moreskant` holder ([#472](https://github.com/jivancevic/sveta-cecilija/issues/472)). Izvedbe is **one screen for every permission**: what it shows depends on `can()`, never on a second address. Two surfaces for two devices was rejected as the same content twice, drifting.

**4. Payload keeps auth and data for this effort (phase A); removing it is phase B.** Payload still provides the login cookie, the local API and stock CRUD, and the schema stays owned by `db/schema/*.sql` ([ADR-0013](./0013-schema-management-bootstrap-sql-drift-gate.md)). Ripping it out mid-season is a rewrite with zero new features. Phase B gets its own map after v1, when the only Payload consumer is our own code.

**5. New app code reaches data through a repository seam.** `src/lib/repo/` exposes `getRepo()`; only `src/lib/repo/payload/` may import `payload`, and a file-scan test enforces it. Adoption is **per rebuilt screen**, not a sweep: a screen migrates when its ticket rebuilds it, and existing call sites stay until then ([#475](https://github.com/jivancevic/sveta-cecilija/issues/475)). Without the seam, phase B is a rewrite; with it, it is mechanical.

**6. The Backoffice survives behind `dev`, plus `editor` for two collections.** `/admin` stays for raw edits, bulk fixes and the things v1 deliberately leaves out (CSV export of orders, bulk create, Partners CRUD and partner logins, promo-code UI, blog posts, FAQs, order lookups). No Cecilija page links to `/admin` for anyone but a `dev` holder, and an `editor` holder opens it for Objave and FAQ only ([#476](https://github.com/jivancevic/sveta-cecilija/issues/476), [#500](https://github.com/jivancevic/sveta-cecilija/issues/500)).

**7. The access rule is "at least one screen".** See the amendment to ADR-0023 below.

**8. Every path segment is English; two 308s are permanent.** The `/app` Croatian segments are renamed screen by screen to the table in `docs/agents/moreskant-app.md` as each build ticket lands, never in one sweep, each with a 308 from the old path for one release ([#481](https://github.com/jivancevic/sveta-cecilija/issues/481), [#473](https://github.com/jivancevic/sveta-cecilija/issues/473)). Two of those 308s are **kept permanently**: `/app/instalacija` → `/app/install`, because the QR may hang on a rehearsal wall, and `/app/prijava` → `/app/session`, because the sign-in link is already in SMS and mail.

**9. The look is one light base with exactly two night islands.** Paper `#f5f2ec`, ink `#1a140c`, gold `#b8881a`, radius 0, no automatic dark mode. The dark treatment is reserved for the "next performance" hero card and the whole Skener, where it earns its place at a night performance. Density is a breakpoint, not a user toggle ([#490](https://github.com/jivancevic/sveta-cecilija/issues/490)).

**10. The shared `tehnika` login stays.** The door crew got personal `door` accounts, which is what makes a scan attributable, but the shared login remains as the stand-in fallback for the night somebody works the door without an account ([#478](https://github.com/jivancevic/sveta-cecilija/issues/478)). This reverses the expectation, recorded while charting, that personal logins would retire it. The shared `member` login also stays until the other sections have profiles ([ADR-0022](./0022-member-season-dashboard.md)).

## Amendments to earlier ADRs

**ADR-0023 decision 3 is superseded by this ADR.** "`/app` is the primary staff surface, Payload admin becomes backoffice" becomes: Cecilija is the *only* daily surface, the Backoffice is behind `dev`, and the end state has a definition of done (nobody but the developer opens `/admin`). The access decision generalises with it: `decideAppAccess` returned `voditelj | moreskant | denied`, and now answers **"a signed-in account is in when its permission set unlocks at least one screen"**, returning the screen set. `refunds` and `dev` unlock no screen on their own; `moreskant` unlocks nothing unless the linked Member is an active moreškant; `partner` unlocks nothing without a Partner link. An account that unlocks no screen, or that types a route it does not unlock, sees a panel naming the situation: never a silent redirect, which hides a stale bookmark, and never a 404, which lies.

**ADR-0024's "web push is the only channel" is narrowed.** Push remains the only **delivery** channel: still no email, SMS or WhatsApp for roster notifications. But every notification is also **kept per account** in an inbox, reachable from a bell in the header of every screen. Per account, not per device, so the unread count agrees across a person's phone and laptop. A push that arrives while the phone is off is no longer a notification nobody can recover.

## Alternatives considered

- **A second container / repo / monorepo for the app** ([#471](https://github.com/jivancevic/sveta-cecilija/issues/471)): rejected, see decision 2.
- **Replacing Payload's auth and data now**: rejected, see decision 4. It is phase B, not never.
- **Keeping the Payload shell and adding views to it**: the friction that prompted ADR-0023 (hand-maintained importMap, the CSRF/Origin gate, string-path component refs) does not improve with more views.
- **Croatian route segments** for a Croatian-only app: rejected under the repo-wide English-path rule (#481); Croatian stays where it is the domain, in copy and enum values.
- **An English UI for partners**: out of scope until a partner actually works in English.

## Consequences

- `CLAUDE.md` gains an ADR-0027 pointer on the Cecilija row and the routes table; `CONTEXT.md`'s *Product surfaces*, *Screen*, *Denied* and *Notification inbox* entries are the vocabulary this ADR assumes.
- The `/app` route table has a transitional period where some segments are Croatian and some English. `docs/agents/moreskant-app.md` marks which is live.
- Phase B cannot start until the seam covers every screen, which makes decision 5 the load-bearing one: a screen rebuilt without the seam is a screen phase B has to rebuild twice.
- Retiring the Backoffice entirely is **not** part of v1 and may never happen: some raw edits are cheaper in a generated CRUD UI than in a designed screen.
