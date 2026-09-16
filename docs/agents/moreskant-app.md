# Cecilija (`/app`)

**The app is called Cecilija** (renamed from *Moreškant* in #489; rule and
declension in `CONTEXT.md` → *Product surfaces*). "Moreškant" now names only the
dancer and the roster section of Cecilija, which is what this file documents.

The dancer-facing surface of the roster module ([ADR-0023](../adr/0023-permissions-replace-roles-app-surface.md), [ADR-0024](../adr/0024-moreskant-roster-domain.md); phase 3 = #419). Croatian only, mobile first, no ticketing. Glossary in `CONTEXT.md` → *Moreškant*.

## Cecilija route map (#473)

Decided 2026-09-12 under the Cecilija map (#471), after the navigation
decision (#472). This is the **target** table: every screen keeps its Croatian
label and gets an English path segment (the #481 rule), renamed **screen by
screen** as each build ticket lands, never in one sweep. Until a row is built,
the "Today" path is still the live one.

**The shell shipped in #495.** Every screen that existed before it now answers
on its English route with a 308 from the old one, and the table below says so
in the *Today* column. The table itself lives in code as
`src/lib/app/screens.ts`: label, route, rank, the permissions that unlock it
and the sidebar group, read by the phone bar, the laptop sidebar, the
active-tab highlighter and every page gate. A screen that is not built yet
carries an empty `servesToday`, so the bar never offers a tab that 404s; **the
one thing a screen ticket changes in that file is moving its permission from
`unlockedBy` into `servesToday`.**

### Screens and the permission that unlocks each

Rank was the bar order from #472 (the first four screens a person unlocked were
tabs, Izvedbe jumping to the front for a `moreskant` holder). **Since #563 the
bar is three screens chosen per account** — see "The tabs belong to the
account" below — and rank is what orders Više, the sidebar inside a workspace,
and the generic order's top-up. **Since #565 the dance has a screen of its
own**, Moreška, and it is what a dancer's generic bar opens with; Izvedbe is the
blagajna's and the voditelj's, and a `moreskant` does not unlock it at all.

**Where a booking's two facts go matters to Moreška** (Q30): the ship or the
agency belongs in `shows.client` and the meeting place in `shows.location`.
Moreška prints the location and never the client, so that guarantee only holds
for what is actually in `client` — a row that spells "Le Ponant" into
`location` puts the ship in front of every dancer, and no code can tell. Both
halves of Dodaj / Uredi (#503) and the MCP `create_performances` tool keep the
two fields apart for this reason.

| Rank | Screen (label) | Route | Unlocked by | Today | Old path |
|---|---|---|---|---|---|
| 0 | Početna (the landing screen) | `/app` | any screen | **live** (#564): the logo and the wordmark (the only screen with them), a greeting by time of day with the reader's first name and no vocative, one sentence about the next nastup or izvedba in the reader's own register, and then one card per tab in the account's own order plus Obavijesti — **four at most**. The Moreška card is the hero of the next nastup with Dolazim / Ne dolazim in it and the ArmyBar under it (T4's own `heroView` / `Answer` / `StateBar`, never a copy); Statistika is a Ring of the next public izvedba over the venue's capacity; Ljestvica is the Podium of the top three plus "ti si N. s M"; every other screen is one figure and one action. **A card whose screen the account does not unlock is never built**, because the cards come off `nav.tabs` and there is no second list. Rules in `src/lib/app/home-screen.ts` (pure), loads in `home-data.ts` (only the cards this reader gets, each from the loader its own screen already uses). Početna is the FIRST tab, never storable on `Users.tabs`, never in Više | it used to 307 to the person's first tab (#495) |
| 1 | Narudžbe | `/app/orders`, `/app/orders/[id]` | `tickets` | **live** (#501): the list with search (name, e-mail or code), a performance filter, a state filter (`active\|refunded\|partner\|comp`) and a pager, all in the query string; the detail with the order's facts, its tickets and four named actions — Povrat (`refunds` only, and only on a paid, unrefunded order), Pošalji ulaznice ponovno, Otvori PDF, Uredi kupca | none, the Backoffice keeps its list |
| 1.5 | Moreška (the dancer's register screen) | `/app/moreska` | `moreskant`, `moreska` | **live** (#565): the 44px RoleMark with the name and "N nastupa pred tobom"; the hero of the next nastup (the day at 80px, weekday · time · Redovna, the voditelj's note, Dolazim / Ne dolazim, and after an answer "Dolaziš · Crni" or "Ne dolaziš" with Promijeni); the ArmyBar under it, which taps through to Stanje; then the season by month, a gold DateDisc for every Redovna and one chip per row. **A non-regular evening reads "Vanredna" and never names its client or its kind**, there is no seat count or revenue anywhere on it (Q29) and no Dodaj (Q31). What it says is `src/lib/app/moreska-screen.ts`, pure and tested without a database. **`/app/moreska/[id]` is Stanje** (#566), one nastup with its two armies and its four titles | new; nothing 308s here |
| 2 | Izvedbe (one screen, content by `can()`) | `/app/performances`, `/app/performances/[id]` | `tickets`, `moreska` (a `moreskant` reads the schedule on Moreška since #565 and one evening on Stanje since #566, so Izvedbe is not theirs at all) | **live, redesigned by #567**: the season as a register — every izvedba, public and non-public, for both halves — with the blagajna's sold-of-capacity, channel split and per-show numbers under the public rows (the old `/admin/stats/[id]` drill-down), and the detail **titled by the date** (Q32). **Dodaj and Uredi are either half's** since #567; the six named actions are gated one at a time and a refused one is greyed with *traži Blagajnu* rather than hidden (Q53), Otkaži asking for `tickets` **and** `refunds`. Since #538 the per-show *Prihod* is online money net of refunds plus the evening's ledger, with the partner seats named under it at face value, before commission | 308 from `/app/izvedba/[id]`; push messages now carry the new path |
| 2.5 | Članovi (dancer profiles, invitations, join code; absorbs Pozivnice, added by #476) | `/app/members`, `/app/members/[id]` | `moreska` | **live** (#511): the rehearsal join code and its pending claims at the top, Dodaj plesača beside them, then the roster — a diacritic-insensitive search, active moreškanti first and retired ones under them, one row per dancer carrying the nickname, the real name, the primary role, whether a login exists, and the two invitation channels behind a disclosure (`POST /api/app/invite/link` for the SMS link, `POST /api/app/invite` for the letter), plus "Pošalji pozivnice svima"; the profile at `/app/members/[id]` writes nadimak, mobitel, e-mail, plesne uloge, glavna uloga and aktivan through `PATCH /api/app/members/[id]`, and Dodaj plesača through `POST /api/app/members` | `/app/invitations` and `/app/pozivnice` both 308 here; the Backoffice Members list stays for the attribution half |
| 3 | Ljestvica (roster ranking + own season) | `/app/leaderboard?season=2026&part=all\|mine`, `/app/leaderboard/full?season=&kind=` | `moreskant`, `moreska` | **live** (#568): *Ljestvica* first and by default, *Moja sezona* second. The board is TWO lists, Moreška and Experience, each a podium of its top three, the rows to twenty, the reader's own row highlighted or pinned, and "Vidi cijeli popis" into the whole ranking. Everyone reads the same two lists: the voditelj's six-column scoreboard went with `StatsTable` | 308 from `/app/moje` (→ `part=mine`) and `/app/statistika` (→ `part=all`) |
| 4 | Skener (camera, code entry, door list) | `/app/scan` | `door` | **live, redesigned by #572**: the camera and the four result states, Pusti ostatak grupe (n), Poništi propuštanje, Pronađi ulaznicu and the "ušlo X od Y" ring, all on one screen. Since the redesign the whole screen is dark whatever skin the reader chose (`data-theme` on its own root, not an island of its own), the ring is the `lg` one and its count runs up when somebody walks in, and Pronađi ulaznicu is a sheet rather than a form living open under the scanner. **The camera flow itself is untouched by all of it** — `scan-camera.ts`, the iOS WASM ponyfill, `startCamera` and `handleDecoded` are where the reliability work left them | `/admin/scan` 308s here and the Backoffice view is deleted; the ticket QR stays `/scan/[token]`, whose staff buttons point at `/app/scan` |
| 5 | Prodaja | `/app/sell` | `partner` | **live** (#505): the izvedba picker with seats left, the two steppers, Izdaj ulaznice → the PDF, Zadnje prodaje with the delete-then-undo storno, and the live month card | the Backoffice partner dashboard stays until #512 |
| 6 | Obračun | `/app/statement` | `partner` | **live** (#505): the season's per-izvedba bars, and a month/year picker that shows the statement on screen before offering its CSV | the Backoffice partner dashboard stays until #512 |
| 7 | Upiti | `/app/inquiries`, `/app/inquiries/[id]` | `tickets` | **live** (#507): the inbox, ordered unanswered first with booking enquiries (`private-moreska`, `moreska-experience`) lifted above general ones, a `state=new\|handled` filter and a pager in the query string; the enquiry itself with the whole message, **Odgovori** as a `mailto:` carrying the subject and the quoted message (Tatjana sends from `info@` in Gmail, in-app sending is out of scope) and **Označi riješenim** in one tap, whose undo is the same button (`POST /api/app/inquiries/[id]/handled`, a switch rather than a toggle, so a retry is harmless) | the Backoffice keeps its list; the "Mark handled" edit-menu item there still writes the same column |
| 8 | Gratis (comp tickets; promo codes stay in the Backoffice for v1) | `/app/comp` | `tickets` | **live** (#506): Podijeli gratis (izvedba picker with seats left, a REQUIRED member picker with search and an inline Dodaj člana, the two steppers, the holder name prefilled from the member, an optional e-mail) → `/api/comp/issue`, which opens the PDF and says whether the mail was sent, skipped or failed; Zadnji gratisi with Poništi gratis on a whole order or one ticket behind a confirmation (`/api/comp/cancel` has no undo, so there is none offered); and the Gratis po članu season table with a season picker | none |
| 9 | Korisnici | `/app/users`, `/app/users/[id]` | `users` | **live** (#510): the list of every account with its permission set as Croatian chips, the shared badge, the address or "bez e-pošte" and both links by name, over one search box (username, name, e-mail, and the linked dancer's name, diacritic-insensitive); the detail with eight named actions — **Dozvole** (a checkbox per word of the vocabulary, `PATCH /api/app/users/[id]/permissions`), **Resetiraj lozinku**, **Ime** (#617), **E-mail** (#621), **Poveži partnera**, **Poveži člana**, **Tabovi** (#563) and **Dijeljeni račun**. **Novi korisnik** opens an account on the list screen. **Ime and E-mail are the two that write unlocked fields** and the reason the Backoffice is no longer part of anybody's weekly work here: a name is cosmetic (empty clears it, and there is no self refusal, because correcting your own name grants you nothing), an address is not — it is what a sign-in link is addressed to, so clearing one a named-person set depends on is a 400 naming Dozvole, an address that already belongs to somebody is a 409, the row's own address is a no-op, and no mail is ever sent about the change. Three refusals are the route's and nothing else's, because the local API runs `overrideAccess` and field access does not: a caller may not take `users` off their OWN row (409), a `shared` login may not edit itself (403), and a named-person set (`users`, `tickets`, `moreska`, `finance`, `editor`) on an address-less account is a 400 naming the repair. Linking a member re-applies #487's rule in `/app/account`'s own words — `taken` for a Member who already has a login, `not-active` / `not-moreskant` otherwise — and writes the LINK only: `moreskant` is a permission a `users` holder adds on purpose. **The handover is the point of the screen**: an account with an address **whose permission set unlocks a Cecilija screen** gets a one-hour sign-in link to copy; every other account (no address, or a set like `editor` that lands nowhere) gets a temporary password shown exactly once (14 characters from an alphabet with no `l`, `I`, `1`, `O` or `0`, drawn without modulo bias, never logged). The link is the same token "Zaboravljena lozinka" mints, so it is **not** single-use and there is only one live at a time per account: issuing a second one silently kills the first. A shared login (ADR-0022) is refused as a CALLER on all eight routes, not merely on its own row, and no write may leave `users` on one — the `tehnika` password is written on a wall. Deleting an account stays Backoffice work and the detail says so, with a link only for `dev` | the Backoffice keeps `/admin/collections/users`; no 308, because raw account editing is still the fallback |
| 10 | Statistika (counts only) | `/app/stats?season=2026` | `tickets`, `season_stats`, `finance` | **live for all three, redesigned by #571** (#508): the season band (prodano, gratis, kapacitet, popunjenost), one row per public izvedba (sold of capacity, odrasli/djeca, the four channels, ušlo), the trajectory and channel-mix charts moved as-is, and "gratis po članu" for `tickets` only, which is Gratis's own table (#506) read through `repo.comp` and tallied by `tallyCompsByMember` rather than counted a second way. Counts only, never money: euros are Financije (#509), and since #571 that is a TEST rather than a promise — `stats-screen.test.ts` scans the screen and its view model for a euro, a cent, a revenue and a formatter, because the way that rule breaks is an import nobody renders yet. The redesign also made the season a row of link pills (`ui/Seasons`, Ljestvica's own control, lifted) instead of a `<select>`, and put the channel palette in tokens with a night set (`--ch-*`), so both charts follow the theme switch instead of holding four hexes drawn for paper. A row links into `/app/performances/[id]` only for a reader who unlocks Izvedbe, so the shared `member` login gets the numbers without a link that would refuse itself. **That rule catches a second account, not just the shared one:** Velebit holds `finance` + `door`, which unlocks Statistika but NOT Izvedbe, so he reads every row's numbers with no link on any of them — and his old `/admin/stats/[id]` bookmark, which now 308s to `/app/performances/[id]`, lands on the "Ovaj dio nije za tvoj račun" page rather than on an evening. A `door`-only account does not reach this screen at all, because `door` unlocks neither. **The single-show drill-down had already moved**: `/app/performances/[id]` carries the per-show numbers since #502 | 308 from both, through `src/lib/backoffice-ports.ts` |
| 11 | Financije (money without buyers, added by #476) | `/app/finance?season=2026&year=2026&month=9` | `finance` | **live, redesigned by #571** (#509): **Prikupljeni prihod** for the season (`channel='online'` order totals net of the refunded ones, plus the offline ledger's own Σ quantity × unit price), shown APART from **Potraživanje od partnera** in a card of its own, never summed and never called dobit (ADR-0015, glossary *Dashboard*). **The channel clause is the correctness of both cards**: a partner order stores `total` at face value the moment the reseller issues the seat, so counting it as collected would put the same euros in both, and a storno voids the tickets while leaving `total` and `refund_status` alone, so a cancelled partner sale would never leave the figure. A comp order is €0 and drops out of the same clause. `seasonMoney` re-applies the filter in pure code, which is where it is tested, and since [#538](https://github.com/jivancevic/sveta-cecilija/issues/538) the rule lives in `revenueCollectedCents` itself, so the Backoffice season band and the per-show *Prihod* on Izvedbe apply the SAME rule as this card, though not over the same rows (the band is all-time and unscoped to public performances, this card is one season; `CollectedOrderRow.channel` is a REQUIRED field, so a caller that forgets to read the column fails `tsc`); **Povrati** as a count and an amount, which includes a lost chargeback because #380 writes the same `refund_status`; **Promo kodovi** as an "of which" line, the revenue column #500 gave `finance` and which had no home after the Backoffice panel; **Obračun po partnerima** for a month the picker caps at the current Zagreb month (Obračun's own bounds, #505), one card per partner with tickets / naplaćeno / provizija / za uplatu and the CSV of the same month behind `GET /api/partner/reconciliation?partnerId=&year=&month=&format=csv` — the figures on screen and the file come from the same arithmetic, so they cannot disagree. **A deactivated reseller still appears where it still owes**: the season total is derived from the SALES (the ticket query joins `partners`, so nobody has to still be sellable to be counted) and the month panel lists every partner that may sell PLUS every partner the month's rows name, badged *neaktivan*. Taking `activeList()` as the whole truth would have dropped a mid-season deactivation's debt from the total and left Velebit with no way to download that month's statement; and **Prodaja na ulazu**, the season's ledger by evening with every line's source, type, quantity, unit price and discount label, a negative line reading as the correction it is. **No buyer appears anywhere on it** and that is asserted as a source scan (`finance-no-pii.test.ts`): whose order it was is a question for Narudžbe, which answers to `tickets`. Counts are Statistika (#508); the two screens never repeat a figure. **Since #571 every explanation on the screen is two parts** (Q46): the sentence that says what a figure IS stays under it, and the caveat — why partner money is not in the first card, why a lost chargeback is in the second, why a promo code is not an extra amount — sits behind a small "i" that opens a sheet (`ui/Explain`). Printed in full the caveats were longer than the figures they explained; none of them was dropped | none, the Backoffice dashboard keeps its band until #512 |
| last | Više (a list, always the last tab) | `/app/more` | any screen | **live** (#495, reskinned #569): **the person first** — a moreškant's RoleMark (the army of their primary role; no title, because a title belongs to an evening) or, for everybody else, their permission set as the Croatian chips Korisnici renders, read through `permissionChips` rather than re-typed. A shared login is named by its USERNAME with a "Dijeljeni račun" chip, because `tehnika` is a room and `member` is the society. Then four rows of their own (Profil · Obavijesti with the unread count as a chip · Sigurnost, which is `/app/account#security` rather than a route of its own · Podrška, a Sheet with `info@moreska.eu` and never a telephone number), then the overflow screens with the SAME icons their tabs carry (`ui/ScreenIcon.tsx`, one map), then the app's own rows (Dobrodošlica, Instalacija, and the Backoffice for `dev`), Odjava, and the build line | 308 from `/app/vise` |

Rows under Više, after the overflow screens:

| Row | Route | Unlocked by | Today | Old path |
|---|---|---|---|---|
| Kalendar | `/app/calendar` | `moreskant`, `moreska` | **moved** (#569): the panel now sits UNDER the list on Obavijesti, because both halves of that screen are the same promise at two speeds | new |
<!-- Pozivnice was a row here until #511 folded it into Članovi; both of its old
     paths now 308 to /app/members. -->
| Profil (the person, the two switches, the member link, the password) | `/app/account` | any screen | **live** (#495, reskinned and renamed #569): "Moj račun" became **Profil** so the row and the screen are called the same thing; Moji podaci, **Izgled** (the theme switch), **Obavijesti** (push as a switch), the self-link and, under `#security`, the password | 308 from `/app/set-password` and `/app/povezi` |
| Backoffice (link to `/admin`) | `/admin` | `dev` only | **live** (#495): the row, the denied panel and the consent screen all lost their general `/admin` link | done |
| Odjava | `POST /api/app/logout` | any screen | same | unchanged |

**The foot of Više names the build**: "Cecilija · ad0eb9c" and, under it in very
small type, "Created by: Josip Ivančević" (the one English string on a
Croatian-only screen, kept that way by decision in #637 — it is a signature, not
a sentence). The commit is `deployedCommit()` in `src/lib/health/health.ts` —
**the same reader `GET /api/health` reports from**, which is #569's acceptance
criterion and is asserted in `src/lib/app/build.test.ts`. Two
`process.env.SOURCE_COMMIT` reads would be two answers to "which build am I
looking at" the day Coolify's variable is renamed.

**There is no version in that line, and #637 decided there never will be.**
`package.json`'s `0.1.0` had not moved since the repo's first commit, so it read
as information and was not. It was not replaced either: `main` auto-deploys
(ADR-0026) at roughly twenty merges a day, so every scheme that writes a version
into `package.json` — a patch bump per merge, semantic-release off the
conventional-commit prefixes — costs a bot commit and a second deploy per merge,
and at that tempo `0.3.180` read back over the phone tells the developer nothing
until they go look up what the number was. CalVer from the build date
(`v2026.09.15`, free from a `RUN date` in the Dockerfile's build stage) was the
runner-up and went with the rest. The commit answers the only question the line
is asked.

**The sha is not meant to be transcribed**, which is the other half of the
ticket: seven characters carrying `0`/`O` and `b`/`6` are exactly what
CONTEXT.md's temporary-password alphabet exists to avoid. So it leaves the phone
two other ways, both fed from ONE `deployedCommit()` read on the page. Tapping
the line copies it whole ("Cecilija · ad0eb9c"; the bare sha pasted into an SMS
reads as a typo), and **Podrška's `mailto:` carries it in the body** together
with the signed-in **username** — `tehnika` has no address of its own
(ADR-0022), so a mail about the door tablet arrives from the private address of
whoever is holding it and nothing else in it says which account was signed in.
The body is assembled by `src/lib/app/support-mail.ts`; a missing commit or
username drops its whole line rather than printing an empty label. Still e-mail
only and never a telephone number, asserted there rather than left to a
reviewer's eye.

A stale PWA window left open across a deploy is a separate problem and a
separate ticket (#638): the service worker has no cache, so a page that loads is
always the current build, but a window that has been sitting can ask for a
Next.js chunk the deploy removed.

Screens that are not rows: **Obavijesti** is a bell in the header of every
screen with the unread count, opening the inbox at `/app/notifications`
(**live**, #496; also listed as a row in Više, because the bell carries no
label); **Dobrodošlica** at `/app/welcome` (was `/app/dobrodosli`, 308) is
shown once per device and only to a `moreskant` holder, everyone else lands
straight on Početna.

Public pages, no session:

| Page | Route | Today | Old path |
|---|---|---|---|
| Instalacija (the rehearsal QR target) | `/app/install` | **live** (#495) | 308 from `/app/instalacija` **kept permanently**: the QR may hang on a wall |
| sign-in by link (invitation, new password) | `/app/session?token=` | **live** (#495); invitations are issued on the new path | 308 from `/app/prijava` **kept permanently**: the link is in SMS and mail |
| `/app/login`, `/app/forgot`, `/app/authorize`, `/app/join/[code]` | unchanged | | 
| ~~`/app/set-password`~~ | the signed-in password form folded into `/app/account` (#495); only `POST /api/app/set-password` keeps the name | 308 | |

Every other 308 follows the #481 rule: one release, dropped after the season.

### Two registers, one evening (#565)

The same performance carries a different Croatian word depending on **who is
reading**, never on which screen or URL they are on (CONTEXT.md, decided
2026-09-13):

- **selling register, "izvedba"** — the public site, tickets and e-mails,
  Narudžbe, Izvedbe, Statistika, Financije, Skener, Prodaja and Obračun.
- **dancer register, "nastup"** — Moreška, attendance, the lineup, the roster's
  push messages (every one of `PUSH_MESSAGES`) and Ljestvica with the dancer's
  own season.

A person who holds both sets reads both words for the same evening and that is
correct: the Moreška tab says "nastup", the Izvedbe tab says "izvedba". English
stays "performance" in both; the split exists only in Croatian. The copy lives
in `APP_STRINGS.moreska` and `APP_STRINGS.home` respectively, and the header of
`src/lib/app/strings.ts` restates the rule for whoever adds the next string.

**Stanje is `/app/moreska/[id]` since #566**, and with it the two halves of an
evening finally live on two screens: the dance under Moreška, the ticket shop
under Izvedbe. Three consequences, all of them deliberate:

- the Izvedbe detail is back to `openScreen('performances')`. It answered to
  both tabs for one ticket (#565), which was the stopgap that kept a dancer's
  deep link working;
- **every roster push points at Stanje**: `performanceUrl` in
  `src/lib/push/recipients.ts` builds `/app/moreska/<id>`, because every
  notification the roster gets is addressed to a dancer, and a `moreskant`
  login does not unlock Izvedbe at all;
- nothing was added to the screen table for it. A screen's route covers
  everything under it, so `/app/moreska/[id]` lights the Moreška tab for a
  dancer and a voditelj alike.

### The hero is a DAY, not an evening (#591)

Both screens that draw one — Početna's Moreška card and Moreška itself — go
through `pickHeroPerformances()` (`roster-loaders.ts`) and `heroView()`
(`moreska-screen.ts`), so they can never split a day differently or name the
same evening two ways.

- **A day is `shows.date`, a Zagreb calendar day.** The column is `dayOnly` and
  already written in Europe/Zagreb, so two rows share a day exactly when their
  date strings match. No clock is read and no instant is compared, which is what
  keeps the function pure and keeps a phone in another timezone from splitting
  an evening off its own morning.
- **Two halves at most**, plus a count. A morning Experience and the 21:00
  redovna is ordinary; three nastupa in a day happen, and three halves on a
  phone is a list pretending to be a hero. The rest become "još 1 nastup taj
  dan ›" linking into the agenda.
- **Each half is a whole question**: its own time, its own kind word, its own
  place, its own Dolazim / Ne dolazim (`Answer small`) and its own "crni N ·
  bili M". A dancer may be in one of the two and not in the other.
- **No ArmyBar in a half.** The bar is a statement about ONE evening's two
  lines; two of them under one date is a chart. It stays on the single hero and
  on Stanje.
- A cancelled row is skipped throughout, first or second, for the same reason
  `pickNextPerformance` skips it: the hero answers "where am I next", never
  "nowhere, this is off".

### An evening reads as one of THREE categories (#591)

`src/lib/app/performance-kind.ts` is the only place that knows: `kindWord()`
gives "Redovna", "Vanredna" or "Experience" and `kindTone()` gives
`regular | extra | experience` for whatever dresses it. The hero, the Stanje
head and the Moreška rows all read it.

Q30 of #565 had two words and "Vanredna" covered every non-regular kind. That
is still right for a ship group, a concert or a charity evening and wrong for
the Moreška Experience, which has a postava of its own and its own half of
Ljestvica (glossary: *Moreška Experience*, *Vanredna izvedba*). The word is the
English one because that is what the society calls the product. The tone is a
CATEGORY and never a colour: `DateDisc` maps it to gold, nothing, or copper
(`--copper` / `--onCopper`, a first pass; #592 settles the palette).

### The access rule

**A signed-in account is in when its permission set unlocks at least one
screen.** The permission → screen table above lives in one module
(`src/lib/app/screens.ts`, written by #495) and the bar, the sidebar, the
active-tab highlighter and every page's gate read it; nothing re-types it.
`decideAppAccess` returns `{ kind: 'ok', screens, nav, self, partnerId } |
{ kind: 'denied' }`, and a page opens with `openScreen('<key>')`
(`src/app/app/gate.tsx`), which answers all three cases in one place:

- `moreskant` unlocks nothing unless the linked Member is an active moreškant
  (today's "access follows the roster" rule, unchanged).
- `partner` unlocks nothing without a Partner link.
- `refunds` and `dev` unlock no screen on their own: a refund is an action
  inside an order, `dev` is the diagnostics strip and the Backoffice link.
- "Is there a dancer here" stays a separate question (`self`), answered by the
  linked Member exactly as now.

A signed-in account that unlocks no screen sees the "Nemate pristup" page:
"Tvoj račun još nema pristup nijednom dijelu Cecilije. Javi se tajnici ili
voditelju." plus Odjava, and a Backoffice link **only** for a `dev` holder. An
account that unlocks screens but types a route it does not unlock sees the same
panel with a link back to its landing screen: never a silent redirect (hides a
stale bookmark) and never a 404 (lies). That second panel is unreachable while
only Izvedbe and Ljestvica are built, because the same two permissions unlock
both; the first screen ticket that lands makes it reachable. No `/app` page links to `/admin` for
anyone but `dev`: the denied page, Više, the consent screen and the staff
buttons on `/scan/[token]` all lose it.

### The tabs belong to the account (#563)

A bar was the first four screens a permission set unlocked, in rank order. It
is now **three screens chosen per account** (decisions Q52, Q56, Q57, Q60),
stored on `Users.tabs` as an ordered list of screen keys, plus Više (and
Početna once T3/#564 lands), neither of which is ever stored. `MAX_TABS` is 3.

- **Who chooses.** A `users` holder, on the Korisnici detail: the named action
  "Tabovi", a sheet of the account's unlocked screens, tap to add or
  remove in order. **A `users` holder may arrange any bar, their own included**
  (#591, reversing Q52's own-row 409): a bar is somebody's decision ABOUT an
  account, and in a society with one `users` holder "ask the other one" was an
  instruction with nobody on the far end of it. Self-service from Profil is
  still not a thing — there is no tab picker there.
- **The write.** `PATCH /api/app/users/[id]/tabs`, behind
  `requirePermission(req, 'users')` like the other five, rules in
  `src/lib/app/users-tabs.ts`: 400 for a key that is not a screen, a fourth
  key, a repeated one, or a screen the account's set does not unlock. An empty
  list is a real answer and means the generic order. The caller's own row is
  not refused.
- **A tab is an order, never a permission.** A stored key the account stops
  unlocking is dropped on read (`tabKeysOf` is lenient, `appNav` filters), so a
  bar can never be the reason somebody reaches a screen.
- **The generic order**, for an account nobody has chosen for, lives in
  `screens.ts` beside the table: `moreskant` → Moreška · Ljestvica; `door` →
  Skener; `partner` → Prodaja · Obračun; `season_stats` → Statistika;
  `finance` → Financije · Statistika; `tickets` → Narudžbe · Izvedbe · Upiti;
  `moreska` → Moreška · Članovi · Izvedbe. A set holding several merges dancer
  → box → other, duplicates collapse, the first three win, and a bar shorter
  than three is topped up in rank order. Since #565 "Moreška" in those rows is
  the Moreška screen itself, which is why the dancer's row has no Izvedbe in it
  and the voditelj's does.
- **Storage.** `Users.tabs` is a `json` column, field-locked to `users` for
  read, update and create like `permissions`. Deliberately not a
  `select hasMany` enum child table: the vocabulary is the screen table, which
  grows with every screen ticket, and an enum would turn "add a screen" into a
  schema migration. `db/schema/migrate-zz-dh-users-tabs.sql`.

Više still lists every other unlocked screen, and the laptop sidebar still
shows everything grouped by workspace, so a chosen bar hides nothing.

### Header

Every screen carries a thin header: the screen's title on the left, the
notification bell with the unread count on the right, on the phone and on the
laptop alike. The count is per account, not per device, so it agrees across a
person's devices. `AppShell` renders the title from the screen table and the
bell unconditionally (#496); a screen's own `actions` sit to the bell's left in
the same slot, so the bell never moves under a reader's thumb.

### The look

The palette is #490's, declared once in the `.app` block of
`src/app/app/app.css`: paper `#f5f2ec`, ink `#1a140c`, gold `#b8881a` with
`--goldText #8f6a10` wherever gold carries text, radius 0, and `--rowY` as the
row rhythm (11 px on the phone, 6 px from 1024 px up). There is no dark mode
and no toggle. **Two night islands, and only two**: the "next performance" hero
card and the whole Skener screen, which share one token block on
`.app__hero, .app__night` (#504). An island overrides the TOKENS, never the
colours, so everything inside it follows without knowing where it is. Skener
adds four tokens of its own (`--ok`, `--seen`, `--void`, `--bad`): the four
answers a scanned ticket gives are a role the paper palette never had.

> Every paragraph above this line describes the look the redesign is replacing.
> The islands are gone with #572: the palette has a night set of its own now,
> and a screen that wants it asks for it by `data-theme`. See *The skin* below.

**The redesign (#560, decided 2026-09-13) replaces this look screen by screen.**
The design decision record for `/app` is the plan artifact
(https://claude.ai/code/artifact/b63a989f-e765-4b02-bb43-2be86bca735c):
decisions Q1-Q67, the system contract (tokens light and dark, type scale,
spacing, components, motion) and the tickets T0-T13. A screen ticket reads the
contract there, never a paragraph here; the paragraph above describes what
ships until that screen's ticket lands, and goes when #560 closes.

### The frame

One responsive layout (ADR-0027), in `(shell)/layout.tsx` since #593 (it was
`AppShell` until then): the laptop gets the grouped sidebar from 1024 px up and
the phone keeps the fixed bottom bar. Both read the same `AppNav` the server
computed, so a phone never ships the permission table.

**A tab tap is meant to paint in one frame** (#593). Three things make that
true and all three have to stay: the bar's links carry `prefetch={true}` and
`PrefetchTabs` asks the router for every route in `nav.tabs` on mount (a bottom
bar is five targets a thumb never hovers, so viewport prefetch fires one tap too
late); `loading.tsx` gives a cold tap a skeleton instead of the old screen held
frozen; and the chrome is in the layout, so only the content changes. The price
of the prefetch is that **every write in `/app` must call `router.refresh()`
after it succeeds** — `staleTimes` is left at its default, so a cached tab is
only as fresh as the last refresh. The one deliberate omission is
`ScanStation`: it owns the "ušlo X od Y" count in its own state and a refresh
per scanned ticket would re-run the whole server render on the door's hot path.

## What ships in phase 3 (#420 → #424)

- Moreškant identity on `Members` and the `Users.member` link (#420).
- The `/app` route group: login, the access decision, the season's performance cards, the PWA manifest (#421).
- **Attendance**: the collection, the answer rules, the army count, Dolazim / Ne dolazim on every card (#422).
- **The performance detail** `/app/performances/[id]`: armies against thresholds, on-behalf answers, the army move, the card headcount chip (#423).
- **Invitations** (#424): "Pošalji pozivnicu" on a Member, `/app/account`, "Zaboravljena lozinka". Rewritten by #463: the link signs the dancer in and the password is optional.

## What ships in phase 4 (#430, batches A → E)

Each batch has its own section further down; this is the map.

| Batch | Tickets | What it added | Section |
|---|---|---|---|
| A | #431, #435 | Web push: the service worker, per-device subscriptions, the sender, the cron, and notification types (1) alarm and (2) reminder | [Push](#push-431-435--phase-4-batch-a) |
| B | #436, #433 | Notification types (3) change, (4) new performance, and (5) withdrawal (retired in #612); the manual alarm; the note edit; the shared calendar feed | [Triggered notifications](#triggered-notifications-436--phase-4-batch-b), [The calendar feed](#the-calendar-feed-433--phase-4-batch-b) |
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

Access follows the **roster, not the login table**: unticking `active` or `isMoreskant` locks a dancer out on the next request without deleting anything (#419, story 16). A voditelj with no Member link is valid (story 15); a `moreskant` with a missing or stale link is denied (story 38). A voditelj who *does* dance fills the link in themselves through `/app/account` (#462, below) — the field is locked to `users` and used to need an administrator.

`src/lib/app/viewer.ts` is the IO half. It does the two things the pure decision cannot:

1. **Re-reads the account and the Member with `overrideAccess`.** Not because the session lacks the link: Payload's JWT strategy loads the user through the local API with `overrideAccess: true`, so the `users` field lock on `Users.member` (#420) never applies to `payload.auth()` — the same reason `permissions` reaches `can()`. The re-read is defence in depth (a session issued before a relink cannot decide who a dancer is) and, either way, the Member row itself is a second document the session never carried.
2. **Tells "signed out" from "denied".** Anonymous → redirect to `/app/login`. Signed in but off the roster → the Croatian "Nemate pristup" page with a link to `/admin`.

`toAppMember()` is an explicit projection, never a spread: `members.email` exists since #420 and must never reach an `/app` payload (ADR-0024's PII boundary is mobiles yes, emails no).

## Reads

`src/lib/app/roster-loaders.ts` (pure, DI'd, unit-tested) + `roster-data.ts` (the Payload call and nothing else) — the phase 2 loader split.

- The season is the calendar year (`seasonYear`, ADR-0022), the same definition the phase 2 stats use.
- The roster deliberately sees **every** performance of the season, public and non-public alike: a ship call is an evening a dancer has to turn up for. So the loader does not *filter* on `isPublicPerformance` but does *use* it, to decide how a row renders (public → `VENUE_LABEL.hr`; non-public → free-text `location` + `client`). That reference is what keeps `show-performance-guard.test.ts` green without an allow-list entry.
- The upcoming/past split is at the performance's own start instant in Europe/Zagreb (`showStartMs`) **plus `SHOW_GRACE_MS`, one hour** (#633). It had no grace window until then, on the reasoning that a dancer's evening is past the moment it begins — which is wrong about the screen a dancer actually holds: the moreška is being danced at that moment, and the widget answering "where am I next" went blank on the evening it was about, at the hour it was about it. It is the BUYER path's own constant rather than a second number, because the two answer the same question about the same evening.
- Cancelled performances survive only within ±7 days of now (`CANCELLED_WINDOW_MS`), struck through; outside that they disappear.
- The local API runs `overrideAccess: true`, so collection access does not scope these reads. The caller has already established through the access decision that the viewer is on the roster, and roster visibility is society-wide by decision.

### Streaming Početna's second half (#627)

**This is the first and so far the only `<Suspense>` boundary in Cecilija.** Read this before adding a second one somewhere else.

Početna draws a card for every screen the account unlocks (Q23-Q26), which for a superadmin is thirteen. Loading them the old way — two `Promise.all` blocks over the whole set — meant nothing painted until the slowest query in the reader's entire permission set had landed. The cards are independent of each other, so they stream.

The shape, and each part of it is load-bearing:

- **`homeCardPlan(nav)`** (`home-screen.ts`, pure) splits the screens in two: `primary` is the account's tab screens, `secondary` is Obavijesti plus every other unlocked screen in `nav.groups` order. Only the plan decides who gets what; there is no second list of who-may-see-what.
- **`loadHomeCard(viewer, key)`** (`home-data.ts`) loads exactly ONE card. Every branch is the whole of that card's IO. That is what makes a boundary around it honest: if a branch awaited something outside its own card, the tile would appear late for a reason the reader cannot see.
- **`loadHomeScreen(viewer)`** awaits the greeting, the sentence, the Moreška hero and the primary cards, and returns `secondary` as KEYS. It never loads a secondary card.
- **The page** (`(shell)/page.tsx`) wraps each secondary key in its own `<Suspense>` around a small async server component that calls `loadHomeCard`. One boundary per card, never one around the whole half: a single boundary would reintroduce the slowest-query problem inside it.

Two rules that are easy to get wrong:

1. **A pending tile holds the height it will have when it is filled**, and shows a muted rule rather than a zero (`.app__home-wait`). A zero is a figure and a reader believes it; a tile that grows when it lands pushes everything under it down while a thumb is already moving.
2. **The shared reads are memoised with React's `cache`**, not passed down. Three cards want the public schedule and two want the roster's, and each boundary loads independently, so without the memo one screen's query would run four times. `cache` dedupes within ONE request and caches nothing across requests, which is why it is safe on a screen that prints the door's live progress.

`dynamic = 'force-dynamic'` stays. Streaming is about the ORDER the response is written in, not about caching it.

## PWA

`public/manifest.webmanifest`: name and short name "Cecilija", `display: standalone`, `start_url` and `scope` `/app`, stone background and gold theme taken from the `.t-stone` tokens, 192 and 512 px PNG icons plus a 512 px maskable one (the webp rule in `assets.md` covers photos in `public/`; manifest icons are PNG by spec). Linked from the `/app` layout only, so no public page advertises it.

The icons are **generated, not drawn**: `node scripts/generate-app-icons.mjs` builds `cecilija-icon-192.png`, `cecilija-icon-512.png`, `cecilija-icon-maskable-512.png` and the root `apple-touch-icon.png` from `assets/images/cecilija-logo.png` (ImageMagick, the same local tool `assets.md` assumes for `cwebp`). The maskable one carries a smaller crest because Android crops to the central 80% circle. **No icon carries a frame**: a gold hairline was drawn inset until #596, and on an iPhone home screen it read as a second border just inside the system's own squircle mask. A logo change is one command, never a hunt through `public/`.

**The icon an iPhone installs is not the manifest's.** iOS reads the
`apple-touch-icon` link, which Next emits from the nearest segment's
`apple-icon.png`, so `/app` carries its own at `src/app/app/apple-icon.png` and
the public site keeps the root one. Editing the manifest alone would leave the
society's website icon on the dancer's home screen.

**An iPhone freezes the name and the icon at install time.** Android and Chrome pick up a renamed manifest on their own; an installed iOS app does not, so the two phones that installed "Moreškant" have to delete and re-add it. That is the whole user cost of the rebrand (#489).

### The status bar is the app's to clear (#482)

The `/app` layout pairs `viewportFit: 'cover'` with `appleWebApp.statusBarStyle: 'black-translucent'`, so the installed app's web view starts at y=0 — under the clock and the Dynamic Island. Nothing puts it back: **every root container under `/app` must add `env(safe-area-inset-top)` itself**, the way `.app__shell`, `.app__panel` and `.app__ob` each do, or its first line renders behind the status bar. The same holds at the other end for `env(safe-area-inset-bottom)`, which the fixed tab bar and the shell's bottom padding already carry. **An installed iPhone (iOS 18.7) sizes the standalone layout viewport at the screen minus the top inset while anchoring it at the top**, so a `position: fixed; bottom: 0` element stops 59pt short of the screen and the bare canvas shows under it (measured on Josip's phone, #592, PR #604). The fix lives once in `app.css` under `@media (display-mode: standalone)`: `html` and the body take `100lvh` (the only unit WebKit reports in full) and `--shim: calc(100lvh - 100dvh)` is subtracted from every bottom-anchored fixed element (tab bar, sheet, scrim, scanner overlay, toasts). A new fixed element at the bottom must subtract `var(--shim)` too, and the `dev` holder can read the live numbers under Više > Profil > Dijagnostika.

The trap is that none of this shows in a browser, where both insets are `0px`: the bug exists only in the installed app on a notched phone, which is the only place a dancer ever sees it. Verify a new `/app` screen on an installed iPhone, not in a desktop tab.

**The service worker arrived with push (#431) and still caches nothing** — the phase 3 reason (#419, story 47) survives it: a cache layer over server-rendered roster data can only turn app bugs into caching bugs. Details in the Push section below.

### The install flow (#455, reworked #616)

Three facts decide what `/app` offers, and all three are pure functions over browser facts, table-tested against real UA strings (`platform.test.ts`, `install-nudge.test.ts`):

- **`detectPlatform`** → `installed | inapp | ios | android | desktop`. `standalone` wins over every UA. An **in-app browser** (Viber, WhatsApp, Messenger, Instagram, any Android WebView) is its own platform, not a phone: the share sheet it shows belongs to the host app and has no "Add to Home Screen" at any scroll position, so the only useful thing to say there is "open this in Safari". That dead end is the most common way an invitation fails, because a link travels by Viber. iPadOS reports a Macintosh UA, so touch points are the tell.
- **`decideInstallOffer`** (`src/lib/app/install-nudge.ts`, #616) → `none | install | inapp`, and it is the LIVE rule: a home screen app is offered nothing, snoozed or not, because `installed` is what the whole rule exists to read; "Kasnije" buys silence until tomorrow; a webview gets the way out. The clause that is not obvious is the desktop one — a desktop browser that has never fired `beforeinstallprompt` is Safari or Firefox, where the guide's "ikona u adresnoj traci" names a control that is not there, so on a desktop the browser's own capability is the permission to ask. A phone always has the three taps.
- **`decideInstallStep`** → `inapp | install | push | on | none`. **Dead code: nothing calls it** (only `platform.test.ts` does). It was the retired banner's rule, which answered install and push in one breath; push is a switch on Profil now (#569) and the install is `decideInstallOffer`'s. Don't wire it back up — the two would disagree about the same device.
- **`INSTALL_PROMPT_CAPTURE`**, injected inline by the `/app` layout ahead of hydration. Chromium fires `beforeinstallprompt` once and never replays it, so a React effect that has not hydrated yet misses it and the one-tap button never appears on the one platform that has one. The script only parks the event on `window`; every decision about it stays in the component.

What this replaced, and why each half was wrong: the old banner asked "push supported?" first, so an Android tab (which always has a `PushManager`) never reached the install offer at all, and the install branch was dead code on the easiest platform; one × wrote a permanent `localStorage` flag, which silenced the banner forever on the iPhone where installing is the precondition for notifications; and one sentence of generic advice served every device, including the webviews where it cannot be followed.

`InstallNudge.tsx` renders the decision on Početna, `InstallSteps.tsx` the numbered steps (with the iOS share glyph drawn inline, because step one is "find this icon"), and `use-install.ts` holds the browser reads. **There is no `InstallHint.tsx` any more** — the banner that answered install and push together was split when push became a switch on Profil (#569). Every storage and capability access stays wrapped in `try/catch`: a private window, a browser blocking site data and a thumbnail-capture pass can each throw, and none of that may take `/app` down.

**Nothing about the device is React's state.** `use-install.ts` exposes the platform and the snooze as `useSyncExternalStore` reads (`usePlatform`, `useSnoozed`), because both are external stores the component only observes; an effect that copied either into `useState` on mount is a cascading render, and the lint rule fails the build over it (#616). `snooze()` notifies its own watchers, so "Kasnije" reaches the card without a second copy of the answer. The platform's server snapshot is honestly `null`; the snooze's is `true` — QUIET — because the one wrong answer there is flashing an install card at somebody who said "Kasnije" an hour ago.

Every browser push call goes through **`push-client.ts`** (#457): `use-install.ts` re-exports its `pushSupported` rather than restating it, so "can this browser subscribe" has one answer. The split is by subject, not by screen: `platform.ts` + `install-nudge.ts` + `use-install.ts` own WHICH DEVICE this is, `push-client.ts` owns the subscription and its round trip to `/api/app/push/*`, and the components own only what is said.

**The three places that show these instructions are one implementation.** Početna's offer, the Dobrodošlica's first step and `/app/install` all call `readPlatform()` and render `InstallSteps`, all offer the same one-tap `install.action` button when Chromium parked a prompt, and all show the same way out of a webview. There is no second set of install copy anywhere in `/app`.

**The offer is asked of the browser, never of a flag** (#616). Until then the only way to be SENT to an install instruction was `needsOnboarding()`, which reads a Member link and a year-long cookie — so an account with no Member (a blagajna) could never reach it, and a dancer who tapped "Kasnije" in June carried a cookie saying "welcomed" while the home screen stayed empty. Two people typed `app.moreska.eu` and landed on Početna with nothing to install from. `display-mode: standalone` is true or false on every load, so the card needs no flag to appear and none to DISAPPEAR. The Dobrodošlica keeps its `hasMember` gate on purpose — its push and calendar steps are written in the dancer's register ("Reci nam dolaziš li", "Alarm od voditelja") — and finishing it snoozes the card so nobody is asked twice in one minute.

**`/app/install`** is the same guide full screen, and deliberately **not** behind the access decision: it is the target of the QR code a voditelj puts on the wall at a rehearsal, and the person scanning it has not signed in yet. Its platform switch exists because the voditelj is holding somebody else's phone half the time.

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
| `moreskant` | their own Member only | before the start, not cancelled | never theirs to set, and an army they send is **ignored** (#565) |
| `moreska` (voditelj) | any active moreškant | any time, cancelled or long past | theirs alone |

- 403 means "you may not do this" (someone else's answer, an evening that has
  started or been cancelled); 400 means "this makes no sense" (unknown status or
  army, an army the member's roles do not cover, a member who is not a live
  moreškant).
- On create the army defaults from the **primary role**: `crni` / `crni_kralj` /
  `otmanovic` → crni, `bili` / `bili_kralj` → bili, `bula` → null. On update it
  keeps whatever the voditelj chose.
- **An army in a dancer's body is dropped, not refused** (#565). It used to be a
  403 ("Voditelj određuje vojsku"), which was a sentence nobody could act on:
  Moreška answers with one tap and offers no army control at all, so an army
  arriving from a dancer is a stale client rather than an attempt at anything.
  Ignoring it means the two rules above decide alone, and a dancer who holds
  BOTH `crni` and `bili` lands in their primary role's army with one tap — while
  a re-answer on a row the voditelj has already moved still keeps the voditelj's
  army, because that is the "on update" clause, not the request.
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
not_coming | clear | undo, army? }` — `army` is read only from a voditelj),
guarded by
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

`/app/performances/[id]`, loaded by `src/lib/app/detail-loaders.ts` (pure) +
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

### The password form and `/app/forgot`

> **Changed by #463, renamed by #495.** The link opens the session by itself
> (`/app/session?token=` → `POST /api/app/session`), and the password form is
> an optional section of **`/app/account`** that takes no token; the API route
> keeps its name, `POST /api/app/set-password`. The paragraphs below describe
> the #424 shape and are kept for the three surprises at the end, which still
> hold. The current flow is
> [Passwordless onboarding (#463)](#passwordless-onboarding-463).

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
alone fill it, and `decideAppAccess` handed them a viewer with `self: null` —
a state that is perfectly valid for a voditelj who does not dance
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

The screen is `/app/account`, reached from the hero on `/app` (where the two
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
everywhere that asks "is there a dancer here"; `/app/account` asks the other
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

### An invitation may not be aimed at a staff login (#462 review, allowlist #520)

A second press MOVES the found login's e-mail onto the Member's and mails that
address a password-reset link. On a dancer that is the point: it is how a lost
letter is fixed. On a login that holds more than `moreskant` it is an account
takeover, because **any** voditelj may edit a Member's e-mail — so pressing
"Pošalji pozivnicu" on a Member whose login is a colleague's staff account would
send that colleague's reset link wherever the presser chose.

`isDancerLogin` (`src/lib/app/invite.ts`) is the guard: it refuses with a 409
before the e-mail move and before any token is minted, unless the login holds
nothing outside the allowlist. An empty permission set passes — a row from
before the vocabulary is still not a staff account.

The allowlist is `INVITABLE_PERMISSIONS` in `src/lib/access/permissions.ts`,
spelled there once with the vocabulary and never re-typed: **`moreskant` and
`door`**. `door` is on it because of #487: one person is one account, so the
door person who also dances gets `moreskant` added to their door login by a
`users` holder rather than a second account opened to be invitable, and a login
that holds only `door` (plus `moreskant`) reaches no further than the shared
`tehnika` account already does — scan a ticket at the gate. Everything else
(`moreska`, `tickets`, `users`, `finance`, `editor`, …) is still a 409 with the
same Croatian sentence. All three callers go through `ensureDancerLogin`, so the
rule is the same for the mail, for "Kopiraj pozivnicu" and for a voditelj
approving a join claim.

**The allowlist does not open a session.** `mayOpenAppSession`
(`src/lib/app/token-login.ts`) still reads the permission set, not the roster
link, so `POST /api/app/session` needs `moreskant` or `moreska`: a link aimed at
a `door`-only login mints fine and then 403s on the tap. That is deliberate —
granting `moreskant` is a `users` holder's act (#487), never a voditelj's — and
it is why the production task (#521) adds `moreskant` to the three door logins
*before* anyone presses "Kopiraj pozivnicu" on them.

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

## The session slides (#650)

[ADR-0028](../adr/0028-moreskant-owns-their-access.md) decision 1. `Users.auth.tokenExpiration` is thirty days and nothing under `/app` ever re-minted the cookie, so a dancer who signed in on 10 September was signed out around 10 October however often they opened the app in between — and for a roster with one e-mail address between seventy-six people, "signed out" means texting the voditelj.

**The rule:** a request under `/app` whose session cookie is **older than seven days** is re-issued for another thirty; a fresher one is left alone. Not "refresh on every load", because minting a cookie is a write to `users.sessions` (`addSessionToUser` rewrites the row) and a dozen of those a day per device buys the dancer nothing. Seven days already gives a weekly user a session that never ends, and the dancer who has been away thirty-one days still falls out — that person needs a fresh way in anyway.

The rule itself is pure and table-tested in `src/lib/app/session-renewal.ts`: `shouldRenewSession(issuedAt, now)`, plus the `iat` reader that feeds it (read **without** verifying the signature, because nothing is granted on the strength of that number — it only decides whether to bother asking). Three refusals worth knowing: an unreadable or `iat`-less token, a token issued in the future (clock skew must not renew on every load), and exactly seven days, since the comparison is strict.

**Where it is wired, and why there.** Two obvious homes cannot do the job: `src/proxy.ts` can set a cookie but must never carry Payload or a database connection, and a server component cannot set one at all (`cookies().set()` throws outside a Server Action or a Route Handler). So the seam is the **`(shell)` layout** — already async, already resolving the viewer, and the one thing in `/app` that survives a client navigation (#593), so it fires once per document load rather than once per tab tap. It covers exactly the signed-in screens; the shell-less pages (`login`, `session`, `join`, `install`) have no session to slide.

The layout asks `appSessionRenewalDue()` (`session-renewal-data.ts`) and mounts `SessionKeeper` **only when the answer is yes**, so on the other six days of the week there is no extra request at all. `SessionKeeper` POSTs `/api/app/session/renew`, which carries the `/app` cross-site guard plus `requireAppSession` — a session is addressed to an **account**, like #496's inbox — and applies the same age rule again before it writes, because this is the handler that writes and a route that renews whatever it is asked to is one stuck retry away from rewriting the row on every load. That decide-on-the-server, tell-a-route-afterwards shape is the seam #652's device heartbeat hangs off.

Minting is `openAppSession` unchanged: the same four Payload helpers a sign-in link uses, never a second crypto decision. Two properties it must keep, both asserted in `session-data.test.ts`: it reads the **raw** row (a projection drops `user.sessions`, and the write-back would sign every other device out), and the superseded `sid` is **not revoked** — a dropped response on a bad connection would otherwise sign the dancer out instead of extending them, and `addSessionToUser` prunes expired sessions on its own.

## Passwordless onboarding (#463)

The last of the three onboarding changes (#455 install flow, #462 voditelj
self-link, this). It changes what AUTHENTICATES in `/app`, so read this before
touching anything under `src/lib/app/{token-login,session-data,join}*.ts`.

The numbers it was built against, from production on 2026-09-12: **76
moreškanti, 70 active, one e-mail address between them, one dancer login.** Every
decision below follows from that line.

### The link opens a session; the password is optional

The old password page ran Payload's `resetPassword`, which stores a hash **and
opens a session**. So the password step was never what signed anybody in: it was
a toll on the way to a session the token had already earned. Since #463:

- both mails and "Kopiraj pozivnicu" point at **`/app/session?token=…`**
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
`shared` login; and a 403 for an account that has no Cecilija to land in.

**That last rule is the shell's, not a list of words** (#510). It named
`moreskant` and `moreska` until Korisnici shipped, back when a link could only
ever be a dancer's invitation and staff set their password in the Backoffice.
Korisnici mints the same link for a new `tickets`, `finance` or `users` login,
so the rule is now `mayOpenAppSession` = the permission set unlocks at least one
screen, read off `screens.ts` — the same sentence `decideAppAccess` applies at
the page gate. `refunds`, `dev` and `editor` are the sets that still fail it.
The two conditional words (`moreskant`, `partner`) are read **optimistically**
here, because this handler holds a token and not a Member row: whether a
dancer's Member is still active is the page gate's question and it re-reads it
on every request. Signing in is not the access decision, and `/api/app/login`
checks no permission either — the two doors have to agree.

**The token is NOT spent on use**, and that is the one decision here worth
arguing with. It lives its natural life instead (seven days from an invitation,
one hour from a sign-in link) and a second tap works as well as the first.
Single use reads safer and is wrong for this audience: the invitation arrives as
an SMS, the dancer opens it in whatever browser the phone hands them, and half
the failures #455 exists to fix end in "open this in Safari instead" — which is
a SECOND tap on the same link. Burning it on the first tap would turn the app's
most common recovery into a dead end. The link is as sensitive as the SMS thread
it sits in, for as long as it lives.

**But there is only ONE live token per account**, because it is a column
(`users.reset_password_token`), not a table. Issuing a new one overwrites the
old: a "Resetiraj lozinku" from Korisnici, a "Zaboravljena lozinka" the person
asked for themselves, or a re-sent invitation all kill whatever unconsumed link
was outstanding on that account. That is usually what is wanted — the second
link is the repair for the first — but it means an invitation handed over on
Monday stops working if anybody presses reset on Tuesday, with no sign to either
of them. Re-issue rather than hunt for the old one.

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

**Članovi (`/app/members`) is where a voditelj hands one over**, on the phone
they are already holding (#511; it was `/app/invitations` until then, which now
308s there). Every moreškant is on that list whether or not they already have a
login, because re-issuing is the whole answer to a lost phone, and both channels
sit on the dancer's own row behind a "Pozivnica" disclosure: one tap mints a
fresh seven-day link, then the message appears in full with SMS, WhatsApp and
Kopiraj under it. The message is **shown** rather than silently copied, because
the voditelj is about to leave for Messages and should see what they are
sending. The letter ("Pošalji pozivnicu") is offered on every row rather than
only on a dancer who has an address, because an e-mail must never reach an
`/app` payload (ADR-0024's PII boundary) and the route answers "Član nema e-mail
adresu" when there is none. Both are also edit-menu items on a Member, for the
desktop Backoffice where `sms:` does nothing.

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
(QR on `/app/members`, or a printed sheet), the dancer taps their own name,
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
| the page | public like `/app/install` and for the same reason, but it WRITES. Names only — no mobile, no e-mail, no roles (`getJoinCandidates` is where that projection is stated) |
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
**alarm** (1) and the **T-48h reminder** (2). Types (3) and (4) are #436,
the next section.

### The service worker lives at the ROOT, and that is load-bearing

`public/cecilija-sw.js`, registered with `scope: '/app'`. A worker's default
maximum scope is its own directory, so a script under `public/app/` could only
claim `/app/` — and `/app/` does **not** cover `/app` itself, which is the page
the banner lives on: `navigator.serviceWorker.ready` there waits forever. Found
in a real Chrome, not in a test. From the root the allowed maximum is `/`, so
`/app` is granted with no `Service-Worker-Allowed` header.

The worker handles `push`, `notificationclick` and `pushsubscriptionchange`.

**Renaming the worker file needs a migration, and there is one** (#489). A
device holding the old `moreskant-sw.js` registration holds one whose script is
now a 404: nothing tells that device, and its push simply stops. So
`migrateLegacyServiceWorker()` in `push-client.ts` runs on every `/app` load
(mounted by `ServiceWorkerMigration` in the layout): it unregisters a
registration whose script ends in `moreskant-sw.js`, registers the new one, and
re-subscribes plus re-POSTs only if that device was actually subscribed.
Unregister comes FIRST, because unregistering drops the push subscription with
it. It is a migration, not a feature: delete it once the roster's devices have
all opened the app after the rebrand.
**There is no fetch handler and no cache**, deliberately: phase 3's reason still
holds (`/app` is server-rendered from data that changes hour by hour, so a cache
could only turn app bugs into caching bugs). A click opens
`/app/performances/[id]`, reusing an already-open window rather than stacking copies.

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

### The switch (was the banner)

`PushSwitch.tsx` on **Profil** is the per-device control (#430 stories 1-3,
#569). It is a `Switch` reading this browser's own subscription through
`push-client.ts`, and nothing renders until it has looked: a switch that shows
"isključeno" for a beat to somebody who turned it on last week is a lie with a
spinner. Turning it off takes a successful unsubscribe, never an optimistic flip
(#457 review), or a dancer would be told the phone is quiet while it keeps
ringing.

**The three refusals are a `Note`, never a dead switch**: an iPhone that is
still a Safari tab (no `PushManager` until the app is on the home screen, so
there the install IS the switch, and the note links to `/app/install`), a
webview inside Viber or Messenger, and a browser with no push at all.

It replaced `InstallHint.tsx`, deleted by #569. That component asked "uključi
obavijesti?" and answered with a button whose label flipped to "Isključi", and
decided from `decideInstallStep` whether to ask about installing first instead
— see [the install flow](#the-install-flow-455) for why that order was per
platform (#455). A banner that asks a question is right the first time and noise
the fifth; the install half is a whole screen (`/app/install`) one row away in
Više, and `decideInstallStep` still runs the Dobrodošlica and that guide.

## Triggered notifications (#436 — phase 4 batch B)

Types (3) and (4) of the glossary, on top of batch A's sender. Type (5), the
withdrawal, was retired in #612 (see below). Nothing here
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
  in a loop; for a batch of two or more each `payload.create` carries
  `context.skipRosterPush`, the hook honours it, and the route sends a single
  "N novih izvedbi" pointing at `/app`. A **one-row call leaves the hook on**
  (#503) and sends no summary: a voditelj adding a single cruise call means the
  ordinary "Nova izvedba", with the date, the time and the place in it.
- **The hook can never fail a save.** `notifyPerformanceSaved` catches, logs and
  returns; the hook wraps the dep construction in its own try/catch. A voditelj
  must be able to cancel a performance while a push service is down.

`Shows.test.ts` asserts the exact hook list, so a fourth hook has to be
justified there. The hook sends push and only push: buyer email is still only
ever sent by the explicit admin actions (ADR-0024 rejected mail as a roster
channel).

### Odustajanje, and the withdrawal push that used to be type (5)

**There is no withdrawal notification any more (#612).** `src/lib/push/withdrawal.ts`,
`notifyWithdrawal`, the `withdrawal` audience rule, its push strings and the
`onAnswered` seam on the answer handler are all gone, and the migration deletes
the inbox rows they had already filed.

What replaced it is a list under the evening rather than a message about it. A
dancer who answered `dolazim`, let that answer stand at least ten minutes and
then moved to `ne dolazim` has **odustao** (CONTEXT.md *Odustajanje*), and that
shows on *Stanje* as **Odustali**, above *Bez odgovora*, with the hour and with
whether the dancer did it or a voditelj wrote it down. The reason for the change
is what the old push actually produced: twelve unread notices on the bell the
night before, each naming one person, none of them a thing anybody could act on
in that form. The list is.

The rule is `stampWithdrawal` (`src/lib/attendance/withdrawal-stamp.ts`), pure
and tested, and `POST /api/app/attendance` is its only caller. Three columns on
`attendance` carry it:

| column | meaning |
|---|---|
| `confirmed_at` | when the row most recently ENTERED `coming`. It does **not** move while the answer stays `coming`, so the grace window measures how long the promise stood, not when the phone was last touched. |
| `withdrew_at` | when a standing `coming` was taken back. |
| `withdrew_own` | `true` when the dancer did it, `false` when a voditelj wrote it down for them. |

Four things worth knowing before you touch it:

- **Ten minutes is a mis-tap filter, not a policy about lateness.** *Dolazim* and
  *Ne dolazim* are adjacent on a phone card; a reversal inside the window is a
  slip correcting itself, and putting it on the list would send a voditelj
  chasing a dancer who is coming.
- **Coming back clears the trace.** The list answers "who is missing tonight",
  not "who is unreliable". Clearing an answer deletes the row and the stamps
  with it, because "no answer" is the absence of a row.
- **Re-answering `ne dolazim` must not recompute.** On that branch the previous
  status reads as "never promised", so recomputing would erase the very row
  Stanje is showing. The rule returns the stamps untouched there.
- **`withdrew_own` is stamped at write time** because the fact is free there and
  expensive afterwards: the row stores `answeredBy` as a user id, and turning
  that back into "was this the dancer's own login" needs the field-locked
  `Users.member` link. A dancer who withdrew has gone quiet; one a voditelj
  wrote down phoned somebody.

**`undo` is the fourth request and it is not `clear`** (#624). The season list
on Moreška carries two circles per future nastup, and pressing the filled one
again takes the answer back. What that does is `resolveUndo`, in the same file
as the stamps and tested beside them: the row is DELETED when there was no
answer, when the answer is a plain `not_coming` (nothing was ever promised, so
nothing was lost), or when the `coming` is still inside the grace window; past
the window the row falls through to the handler's ordinary `not_coming` write
and picks up the withdrawal stamps from the same `stampWithdrawal` call every
other answer does, and the route answers with that status so the browser fills
the red circle rather than clearing both. The fourth case is a `not_coming` that
IS an odustajanje — it is KEPT, untouched: deleting it would take the voditelj's
Odustali entry with it one tap after it landed there, which is the same hole
seen from the other side. The way back out of an odustajanje is Dolazim, which
clears the trace on purpose.

That split is the whole reason the request exists. Collapsing it into `clear`
would have given a dancer a way out of a postava the voditelj never sees, which
is exactly what Odustali was built to stop; keeping `clear` unconditional is
right for what `clear` is, the voditelj's "this answer was never given" on the
person sheet. The browser cannot decide between the two, because the ten minutes
are measured from a stamp only the server holds — which is why every answer in
`Answer.tsx` settles on the status the route returns instead of on its own
optimistic guess.

Nothing backfills. Rows answered before the migration carry NULL in all three,
so Odustali starts empty and fills from the first answer after deploy, and a
pre-migration `coming` taken back is treated as a mis-tap rather than given an
invented time.

`loadVoditeljUserIds` and the `voditelji` audience group survive the removal
even though no notification kind maps to that group today: they are what any
future voditelj-only notice would want, and deleting them would take the group
plumbing with them.

### The note edit

`POST /api/app/note` (`requirePermission(req, 'moreska')` + the `/app` guard,
`{ performanceId, note }`) saves **through the collection** with
`payload.update`, which is the entire point: the `afterChange` hook fires and a
note typed on the pier notifies the roster exactly as an `/admin` save does. An
emptied note is stored as `null` so "no note" has one representation. The field
with its Spremi button is `NoteEditor.tsx` on `/app/performances/[id]`, rendered for a
voditelj only (the route refuses everyone else anyway). It never auto-saves:
pressing the button is the moment a voditelj decides to tell the roster.

## The voditelj's own izvedbe: Dodaj, Uredi, Otkaži, Pragovi (#503, widened by #567)

Branimir kept next month's cruise calls in the Backoffice, which meant a raw
collection form with a venue, sales counters and a public flag on it. #503 was
those four jobs as named actions on the Izvedbe screen, split by the sentence
from the collections table in `CLAUDE.md`: `moreska` owned non-public rows, and
on a public row it owned the roster fields and nothing else.

**#567 (Q53) moved that line.** Both halves of Izvedbe — `tickets` and
`moreska` — now create and edit BOTH kinds of row, because a season's schedule
is one job and the two shapes of the form differ by what an evening IS (a house
and a capacity, or a place and a client) rather than by who is typing it. What
the halves do not share is the money and the buyers, and that is gated per
ACTION: see [the six named actions](#the-blagajnas-half-of-izvedbe-numbers-and-named-actions-502) below and
`src/lib/app/performance-actions.ts`, the pure map from a permission set to
`{action, enabled, reason}` that the screen renders from and never re-types.

| Route | Guard | Does |
|---|---|---|
| `POST /api/app/performances` | `requirePermission(['moreska','tickets'])` + `/app` guard | one performance, of either kind, for either half (#567). `isPublic` in the body picks the SHAPE the validator applies: a booking is kind, date, time, location, client and an optional note; a public evening is kind, date, time and a venue. The handler re-checks the set (`mayWritePerformance`) rather than trusting the gate, because the local API bypasses field access |
| `PATCH /api/app/performances/[id]` | same | a BOOKING: the same five fields, **409 on a cancelled one**. A PUBLIC row: time, venue, kind, never the date, and **409** on a house change once a ticket is sold. Either half may write either row since #567; what differs is decided by the ROW |
| `POST /api/app/performances/[id]/cancel` | `requirePermission('moreska')` | `status = 'cancelled'` and nothing else; **403 on a public row**; a row that is already cancelled is a 200 with no write |
| `POST /api/app/performances/[id]/thresholds` | same | `{ crni, bili }`, both or neither, 0 to `MAX_THRESHOLD` (40). The one voditelj write that DOES reach a public row |
| `POST /api/app/performances/[id]/pause` | `requirePermission('tickets')` | `{ paused }` → `onlineSalesPaused` (#502). **400 on a non-public row**, which sells nothing to pause. The one action on the blagajna's half whose route did not already exist |

- **What may change is decided by the ROW, never by the URL and, since #567,
  never by the caller.** Dodaj and Uredi are one route each; the handler reads
  `isPublic` (off the body on a create, off the stored row on an edit) and
  applies that kind's validator. `PerformanceFormDeps` still carries
  `permissions`, because the local API runs `overrideAccess: true` and
  `canEditScheduleField` does not gate these writes — but what it now checks is
  one sentence, "is this reader on Izvedbe at all".
- **The money half did not move.** Cancelling a Redovna refunds every buyer and
  mails them and is `POST /api/shows/[id]/cancel` (#497), which since #567 asks
  for `tickets` **and** `refunds` and re-checks the second word in its own
  handler. A voditelj reading the evening sees that button greyed with *traži
  Blagajnu* under it (never hidden, Q53) and the route refuses the request
  anyway: the caption is the courtesy half of a refusal, the 403 is the rule.
- **Uredi on a public row carries no date, and no HOUSE once a ticket is sold.**
  Moving a public evening's date mails every buyer and reissues every ticket
  (#379), so it is *Pomakni datum* with a preview and a test send, not a field
  beside the start time. The venue is the same shape of fact: moving a sold
  evening to another house is *Preseli u zimsko*, which mails every buyer and
  stamps `venue_changed_at` — and that stamp is also what makes the button
  disappear afterwards, so a quiet edit of the column would move the room, tell
  nobody, and then hide the only control that would have told them. So the
  handler asks `activeTickets` when and only when the house is changing, and
  refuses with a **409** if there are any: the request is well-formed and the
  row IS the blagajna's, it is simply in a state where this is the wrong way to
  do it. An evening that has sold nothing (or only at the door, where there is
  no buyer to write to) still moves freely, because nobody has to be told.
- **A cancelled booking is not editable, and that is a 409.** The request is
  well-formed and the row is the voditelj's; it is simply in a state where the
  edit is not allowed, the same shape of refusal as a confirmed postava. The
  reason is the hook: a moved date pushes "izvedba je premještena", and pushing
  that at a roster already told the evening is off is worse than no edit at
  all. A cancelled performance is a record; an evening that turns out to be
  back on is a new one. The tools card drops both controls and says so, so the
  409 is a backstop rather than something a voditelj meets. Cancelling an
  already-cancelled row stays a 200 with no write — that one is the outcome the
  presser wanted.
- **Pragovi reaches every row on purpose.** How many crni and bili an evening
  needs is a fact about the dance, not about the ticket shop, and the
  collection agrees: `canEditRosterField` asks only for `moreska` and never
  about the row.
- **Validation is shared with the MCP tool.** `src/lib/performance-input.ts`
  owns the calendar-day check, the `HH:MM` check, the kind vocabulary without
  `redovna` and the "a booking has a place" rule, plus the two builders that
  turn the checked fields into a create row and an edit patch. Both front doors
  onto a new performance run it, so `2026-02-31` is one answer and not two.
- **The writer is shared too**, through the seam: `getRepo().shows.createPerformances`
  is `createPerformancesInBulk`, so a row added on a phone, a row pasted through
  Claude and a season entered in the Backoffice all get one transaction. Since
  #503 a **one-row** call is not treated as a batch: it leaves the Shows
  `afterChange` hook on (so the roster gets the ordinary "Nova izvedba" with the
  date, the time and the place in it) and sends no "N novih izvedbi" summary.
- **`updatePerformance` goes through the collection**, for the reason the note
  edit does: a change from the phone must ring the same bells as the same change
  from the Backoffice.
- The screen: `AddPerformance` on `/app/performances` (closed until asked for,
  under the hero; since #567 it is offered to either half and the tick box
  opens on the shape that reader enters most), and `PerformanceEditor` /
  `PublicPerformanceEditor` in the **Izvedba** card of `/app/performances/[id]`,
  with `ThresholdEditor` and the note in the voditelj's card under it.
  Thresholds are a **stepper**, never a native number input — on a phone that is
  a pair of tiny arrows next to a keyboard that covers the page. Otkaži on a
  booking is two visible taps rather than `confirm()`, and it is offered only to
  `moreska`, because that route did not widen with the other two.

## The blagajna's half of Izvedbe: numbers and named actions (#502)

The same screen, read by the person who answers for the seats. Tatjana opened
`/admin` for this: a Shows list with twelve columns, five edit-menu items and a
stats view one click further on. #502 is those jobs on `/app/performances`, and
**one screen is the point** — a secretary who also dances reads the sales line
and the headcount chip on the same row.

**What is on the list.** Every PUBLIC row carries `sold/capacity`, what is left,
where the seats came from (`online · partner · gratis · vrata · staro`, the
empty ones dropped) and flags for paused, cancelled, moved and rescheduled. A
viewer who is neither a voditelj nor a dancer gets the ticketed schedule only:
a ship call sells nothing, and a row with no numbers on a sales screen is noise.
`showsRosterHalf()` (`src/lib/app/sales-view.ts`) states that line once and both
the list and the detail read it. The detail also **`notFound()`s a booking** for
such a viewer (`mayOpenPerformance()`): the page prints the client and the
voditelj's note, and an evening the list deliberately leaves out must not be
reachable by typing its id.

**Where the numbers come from.** Nothing is re-derived (`sales-data.ts`,
`sales-view.ts`):

| Figure | Source |
|---|---|
| capacity | `VENUE_CAPACITY[venue]` — there is no `capacity` column |
| remaining | `remainingSeats()`, the same function the sell lock refuses a sale with |
| online / partner / gratis | `getActiveTicketCountsByShowAndChannel` (`tickets/sold-seats.ts`) |
| vrata / staro | `getOfflineTotalsByShow` — the LEDGER's own sums, not the cached counters (ADR-0025) |
| ušlo | `getScannedTicketCountsByShow` |
| prihod | `revenueCollectedCents` applied per evening (`onlineRevenueByShow`) over the evening's ONLINE orders, plus the ledger. **Never a SUM across the join to tickets** — that multiplies by the party size |
| partneri (nominalno) | the adult/child split of the evening's ACTIVE partner tickets, priced at the fixed €20/€10 by `partnerFaceValueCents`. Gross, before commission: NOT Financije's receivable |

`computeShowStats` (the old drill-down) is deliberately NOT reused: it folds
partner seats into `onlineSold`, and the split this screen is asked for names
partner separately. Every query carries `publicPerformanceSql()`.

**Both loaders moved behind the seam with this ticket.** `roster-data.ts` and
`detail-data.ts` were the two entries in `repo-guard.test.ts`'s allow-list that
named #502, and they are gone: the Payload calls are now
`src/lib/repo/payload/roster.ts` and the two `*-data.ts` modules are one line
each. Nothing about the queries changed in the move, and the rules never left
`roster-loaders.ts` / `detail-loaders.ts`, which still unit-test without a
database. `RosterRepo` is separate from `ShowsRepo` on purpose: the roster reads
EVERY performance of the season, public or not, while the buyer's schedule
applies the public predicate — two different questions.

**Revenue is gated on the DATA, not on a class.** `performanceNumbers(sales,
canFinance)` simply does not put the money in the list for a viewer without
`finance`, so no template can leak it by forgetting a condition.
`partnerFaceNote()` answers `null` on the same rule, so the one line
under *Prihod* is absent from the payload rather than hidden by a class.

**Prihod is what the evening COLLECTED, and partner money is not that (#538).**
The read asks for `channel = 'online'` and the arithmetic is
`revenueCollectedCents`, the one definition of collected money in the codebase,
so the number beside an evening and Financije's season figure are the same rule
rather than two that have to agree. Two reasons, both of them correctness: a
partner order stores `total` at FACE VALUE the moment the reseller issues the
seat (ADR-0008) and the society sees none of it until the monthly obračun, so
counting it here would print the same euros as Prihod AND as the receivable;
and a **storno** voids the TICKETS while leaving `total` and `refund_status`
untouched, so a cancelled partner sale would sit in the evening's take for ever
with nothing on the order row to betray it. A comp order is €0 and leaves by the
same clause. The partner seats do not vanish with the money: one quiet line
under Prihod reads *"Partneri: 12 ulaznica, nominalno 220,00 € (prije
provizije, nije u prihodu)"*, omitted when the evening sold none, and never
summed into anything. It does **not** say *potraživanje*: Financije's
*Potraživanje od partnera* is `netCents`, face value MINUS the partner's
commission, so the same word on two different amounts would invite reading one
off the other.

**The six actions.** Five reuse their route unchanged — this is a port, so the
behaviour, the idempotency and the audit writes stay where they are:

| Action | Route | Notes |
|---|---|---|
| Pauziraj / Nastavi online prodaju | `POST /api/app/performances/[id]/pause` | **The one new route.** #366 shipped the pause as a checkbox on the Shows form, so the only way to flip it was the Backoffice. Stops ONLINE checkout only; the sheet says so, because "pauzirano" must not read as "cancelled" |
| Pomakni datum | `GET`/`POST /api/shows/[id]/reschedule` | preview → "pošalji probni mail meni" → confirm (#379) |
| Preseli u zimsko | `GET`/`POST /api/shows/[id]/move-to-indoor` | preview → confirm; offered only on a Ljetno row that has not already moved (#94) |
| Prodaja na vratima | `GET`/`POST /api/shows/[id]/offline-sales` | door and legacy lines, negative corrections, a discount label required below face value; **allowed on a past evening**, because a season is backfilled after the fact (ADR-0025). The GET's existing lines are shown while a correction is typed, which is the safety half: a correction from memory can land the right seats and the wrong money. Its refusals are **translated by code**, not by message: the route answers a stable `OfflineSaleValidationError` code and `ledgerErrorMessage()` turns it into the Croatian sentence naming what to change, because these are the refusals a cashier at the entrance can fix. The mapping is typed `Record<OfflineSaleErrorCode, string>`, so a new code fails `tsc` rather than reaching them as "pokušaj ponovno" |
| Narudžbe za ovu izvedbu | link to `/app/orders?show=<id>` | #501's filter, in the query string |
| Otkaži izvedbu | `GET`/`POST /api/shows/[id]/cancel` | **`tickets` AND `refunds` for the confirm** since #567 (the guard takes `refunds`, the handler re-checks `tickets`), `tickets` or `refunds` for the preview. The sheet prints the money, the seats and the buyers, warns about Brevo's daily ceiling, and on a partial run says the thing #497 designed for: **press it again**, it skips what is done |

Each is a button with a sheet under it that names the consequence, never a
`confirm()` and never a modal. Uredi on a public row is time, venue and kind and
**not the date** — moving a public evening is *Pomakni datum*, with a preview.

## Izvedbe in the redesign: one register, gated per action (#567)

T6 of the redesign (#560). What changed is the SKIN and the line between the
two halves; what an evening sold, who may refund it and which route writes it
are all where #502 and #503 left them.

**The screens.** The list is the season as a register: the next evening as a
`Hero` (with a `Ring` of sold-of-capacity for a reader who sells seats), the
months under it as `Section` + `List`, one `ListRow` per izvedba — **public and
non-public alike, for both halves** — and the past behind a disclosure. A public
row carries a second line under the hour and the house: *prodano 132 od 350*
and the channel split, absent rather than zeroed on a row with no seats. The
detail's **title is the DATE** (Q32, glossary *Title*): "Subota, 19. rujna",
with *Redovna · 21:00 · Ljetno kino* under it. The sticky answer bar is gone,
and so is everything else dancer-facing — a dancer answers on Moreška (#565)
and reads the two armies on Stanje (#566), so `AttendanceButtons`,
`ArmyMoveButton`, `AlarmButton`, `DetailSegments` and `lib/app/detail-view.ts`
went with this ticket. **The `LineupEditor` stays**, in a card of its own, for
exactly the reason #566 gave: it is the tweezers for a row Stanje has no
control for (an unusual role, the voditelj line), and #512 must not take it
away before Stanje can do that.

**The words.** The screen speaks the box office's register throughout —
*izvedba*, never *nastup* — and it is the one screen that NAMES a booking's
client ("Brod, Le Ponant"), which is the exact mirror of Moreška's Q30 rule that
a dancer reads only "Vanredna". Both rules live in pure modules beside each
other (`izvedbe-screen.ts`, `moreska-screen.ts`) and are tested as values
rather than as markup.

**The gate is per ACTION, and a refusal is visible.**
`src/lib/app/performance-actions.ts` maps a permission set to
`{action, enabled, reason}` for the six named actions, and the screen renders
from it — never a `can()` re-typed in JSX, and the client island is handed the
answers as a prop rather than a set to re-derive.

| Action | Needs | Greyed caption |
|---|---|---|
| Pauziraj / Nastavi, Pomakni datum, Preseli u zimsko, Prodaja na vratima, Narudžbe | `tickets` | *traži Blagajnu* |
| Otkaži izvedbu | `tickets` **and** `refunds` | *traži Blagajnu* without the first, *traži dozvolu za povrate* without the second |

A button a reader may not press is **greyed and still there** (Q53), because a
control that disappears with a permission teaches nobody that it exists or who
to ask. It is `off` rather than `disabled` so a keyboard still reaches the
caption. **The caption is never the refusal**: each of those routes re-checks
its permission in its own handler, which is why #567 added the `tickets` check
to `POST /api/shows/[id]/cancel` — a voditelj who can now see the button had to
be refused by the server as well as by the screen.

**Both halves write the season** (also Q53): Dodaj and Uredi are open to
`tickets` and `moreska` alike, for public rows and bookings, through the two
shared routes whose validator and writer the MCP `create_performances` tool
uses. The one write that did NOT widen is `POST …/[id]/cancel`, the booking's
own: it stays `moreska`, because calling off a ship call is the voditelj's
conversation with the ship.

**What a `moreska`-only login can and cannot do** is the ticket's acceptance and
it is asserted three ways: it creates a public evening
(`api/app/performances/route.test.ts`), it is refused the cancellation
(`api/shows/[id]/cancel/route.test.ts`), and every one of its six buttons is
greyed with *traži Blagajnu* (`performance-actions.test.ts`).

## Sandučić obavijesti: the inbox behind the bell (#496)

Push is still the only way a notification is **delivered**; the inbox is where
every one of them is **kept**. `app_notifications`
(`db/schema/migrate-zz-dd-app-notifications.sql`) is a raw table, not a Payload
collection, for the same reasons `push_subscriptions` is not: nobody edits a
notification in the Backoffice, every row is written by a sender, and the query
that matters is a count. It is **not** `performance_notifications`, which stays
the once-per-performance CLAIM keyed on (performance, type).

One row per ACCOUNT per notification, never per device and never per Member:
that is what makes the count agree on the phone and on the laptop.
`src/lib/app/notifications-store.ts` is the table's only reader and writer
(`PoolQuery` in, every statement scoped to one `user_id`), and
`src/lib/app/notifications-write.ts` is the same insert with the opposite error
contract — swallowing — because every sender files a row as a side effect of
something more important.

### A push and its inbox row are one write

`PushMessage` carries a `kind` (`src/lib/app/notification-audience.ts`), so
`createSender` in `push-data.ts` files the rows for **every** roster sender at
once: the manual alarm, the cron's alarm and reminder, a performance created or
changed (the Shows `afterChange` hook AND the two raw-SQL saves in
`raw-save.ts`), a bulk season, and a withdrawn "dolazim". A new sender cannot
compile without saying what it is sending. Two consequences worth knowing:

- the row lands even when VAPID is unconfigured and even for an account with no
  device at all. A dancer who never allowed notifications still finds out;
- filing never fails the send, and never fails a Payload save.

The two kinds with no push behind them — a new inquiry and a new card dispute —
go through `src/lib/app/staff-notifications.ts` instead, called from the
enquiry action's `persist` (so the row is a fact of the submission, not of
Brevo being up) and from the dispute deps' `notifyAdmins`. **Never an order**: a
sale is not news, and an inbox full of them would bury the two kinds a
secretary has to act on.

### Who gets what

| Kind | Audience | Resolved by | Push | Door-only inbox |
|---|---|---|---|---|
| `alarm` | dancers | `Users.member` | yes | no |
| `reminder` | dancers | `Users.member` | yes | no |
| `performance_created` | dancers | `Users.member` | yes | **yes** |
| `performance_changed` | dancers | `Users.member` | yes | **yes** |
| `inquiry` | staff | holds `tickets` | no | no |
| `dispute` | staff | holds `tickets` | no | no |

The rule is a pure table (`resolveNotificationAudience`), so `inbox` is a
superset of `push` by construction: a notification somebody was pushed and
cannot then find in their inbox is the defect the table exists to prevent.

**The route map's open question (#473 Q15), settled by #496: a `door`-only
holder gets the inbox row and never the push**, and only for the two kinds
about the evening itself — a performance created, moved or cancelled. The
roster's alarm and answer reminder stay roster-only, because "javi dolazak" is
not a question the person on the gate can answer. "Door-only" means holds
`door` and none of `tickets | moreska | moreskant`
(`loadDoorOnlyUserIds`); shared logins are deliberately **not** excluded there,
unlike everywhere else, because the door account (`tehnika`) is shared by design
and nothing rings.

### The screen and its two routes

`/app/notifications` opens with `openScreen()` and **no** screen key: it is a
Više row, not a tab, and `UNDER_MORE` in `screens.ts` already lists it so Više
stays lit. Rows newest first, fifty at a time, no "load more" (the rows are
never deleted, so an older one is still there for a query). A row is a BUTTON,
not a link: its job is a write followed by a navigation, and a link doing the
write in an `onClick` would race the navigation.

`POST /api/app/notifications/[id]/read` and `POST /api/app/notifications/read-all`
are the only two writers. They carry **`requireAppSession`**
(`src/lib/app/session-guard.ts`) rather than `requirePermission`, because a
notification is addressed to an ACCOUNT and no permission word names that: the
guard composes Payload's `auth` with the same `decideAppAccess` the page gate
uses, through the shared `resolveAppAccessFor`. It is still an in-handler
re-check, which is the rule (CLAUDE.md); spelling the audience as a list of
permissions would re-type the vocabulary and drift the first time a screen's
`unlockedBy` changed. Ownership is re-checked in the SQL, not in the handler:
`markNotificationRead` carries `user_id` in its WHERE, so an id from somebody
else's inbox is a 404 rather than a confirmation that the row exists.

The push on/off switch is on **Profil** (`/app/account`, `PushSwitch` since
#569), moved there by #495 and not in Više.

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

The role column speaks `LINEUP_ROLES` (`moreskant-profile.ts`): the six dance
roles plus `voditelj`, the member who ran the evening without dancing (every
Moreška Experience has one). `voditelj` is deliberately NOT in `DANCE_ROLES`, so
a profile cannot hold it, `roleWarnings` skips it, and the two loaders that feed
counts (`stats-loaders.ts`, `my-season-loaders.ts`) drop it through their
existing `isDanceRole` filter — a voditelj line counts for nothing. The editor,
the Backoffice select, `set_lineup` and the detail screen all read
`LINEUP_ROLES` / `LINEUP_ROLE_LABELS`. Glossary: *Voditelj (u postavi)*;
migration `migrate-zz-dg-lineup-voditelj.sql`.

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

## Stanje: one nastup, its armies and its titles (#566)

`/app/moreska/[id]`, the screen a voditelj holds in their hand at seven in the
evening and a dancer opens to see whether there are enough of them. It replaces
the Dolaze and Postava segments of the old detail with one picture: the ArmyBar,
crni and bili as two columns with their empty places, a Bule card, and the
roster that has not answered behind a sheet. No seats, no revenue, no buyer:
those are Izvedbe's, one tab away (Q29).

**The columns are the ANSWERS; the lineup only decides whether a crown sits on a
name.** Who stands in crni is `countArmies` over the attendance rows, the single
home of the counting rule, so a dancer the voditelj moves across armies moves
column immediately, before any postava is saved.

**Where a title lives.** In the evening's lineup, never on the profile
(CONTEXT.md → *Title*). The rules are `src/lib/lineup/titles.ts`, pure:

- `titlesForArmy` — crni: crni kralj and otmanović; bili: bili kralj; bula: the
  bula. A title is offered in the column the dancer is standing in tonight.
- `assignTitle` — exactly one holder. Giving a title takes it off whoever had
  it, who goes back to the plain role of their army. **The bula is the one
  exception**: the role `bula` IS the title, there is no plain bula to fall back
  to, so the dancer it is taken from leaves the postava. She still answered
  "dolazim" and still stands in the Bule card; she did not dance it.
- `lineupWithTitles` — what the postava IS before anybody saves it: the answers
  (`buildLineupFromAttendance`) FLATTENED to plain army roles, with the stored
  titles laid on top. The flattening is the point — the suggestion carries the
  dancer's primary role, so a crni kralj by trade would otherwise arrive already
  crowned. A stored title is dropped when its holder says "ne dolazim" or is
  moved to the other army; a stored `voditelj` line is always kept; at most one
  bula is in the list.
- **A stored row for somebody who has not answered AT ALL is kept whole**, role
  and title (#581 review), and it stands in its column with a quiet "bez
  odgovora" chip. `set_lineup` and the Backoffice editor both dictate a postava
  for an evening nobody was asked about (story 62), and a screen that derived
  the list from answers alone would delete that work on the first title tap and
  leave an evening whose four titles sit on nobody, so it could never be
  confirmed. "No answer" is the ABSENCE of a row, which is exactly what tells it
  apart from an odustajanje. The column's own "N od prag" still counts ANSWERS,
  because the ArmyBar above it does.
- `checkTitles` — **a confirmed postava carries all four, once each.**
- `lineupRequirements` / `checkLineup` (#620) — **and whether it has to carry
  them at all depends on the KIND.**

**What a confirmed postava must carry is split by kind** (#620). One function,
`lineupRequirements(kind)`, and everything else asks it:

| kind | needs | refuses |
|---|---|---|
| `experience` | exactly one `voditelj` line | nothing about titles |
| everything else | all four titles, once each | a `voditelj` line outright (400) |

A Moreška Experience is three pairs in the society's own premises: it has no
kings and no bula to hand out, and what it does have is the member who RUNS it
(CONTEXT.md → *Voditelj (u postavi)*). So an Experience confirms on its voditelj
and nothing else, and every other kind of evening cannot even hold the line —
both writers refuse it, the app route (`handleLineupReplace`) and the MCP
`set_lineup`, and the Izvedbe `LineupEditor` stops offering the role there.
On Stanje it is a **Voditelj card** under the Bule, drawn only on an Experience.

**The rule is the CONFIRM's and nothing else's.** It lives in
`decideConfirmation` (`lineup/write-tx.ts`), under the same shows row lock as
the empty-postava rule, over counts the locked read takes with one grouped
`count(*) ... GROUP BY role` — plus `shows.kind`, read `FOR UPDATE` with the
flag for the same reason. Confirming without them is a 400 naming what is
missing or doubled ("Postava nema bilog kralja.", "Dva plesača nose titulu
Otmanović.", "Postava nema voditelja."), followed by the rule for THAT kind of
evening. Unlocking is never refused for it, or an evening confirmed before the
rule existed could not be opened to be repaired. An UNCONFIRMED write still
passes untouched, which is what keeps the MCP `set_lineup` tool working (story
62) and what lets a voditelj fill the columns in over an afternoon.

**A voditelj puts people INTO a list from this screen** (#620). The gesture is
the empty place before the nastup and a single "+ Dodaj u crne / u bile / bulu"
row after it (a past evening has no places left to fill); neither is offered on
a confirmed postava, where Otključaj is the way back in. Three of the four
pickers write an **answer** (`POST /api/app/attendance`, `status: 'coming'` plus
the army, and no army at all for a bula, whose profile puts her in neither):
until a postava is confirmed it IS the answers with the titles laid over them,
so one write serves both readings and the voditelj never learns which table they
are in. Only the Experience's voditelj goes straight to the lineup, because he
did not dance and so has no answer to give — and his write REPLACES whoever was
there, since an Experience has one.

Every picker, and the Bez odgovora sheet with them, carries a
diacritic-insensitive search (`memberSearchKey`, #424's normaliser) and a row of
role filters drawn as **discs rather than words**, offering only the roles
somebody in that list actually holds. Each row shows the other roles that person
can dance as small discs, minus the one they hold by definition in that list
(nobody carries a "Crni" disc inside "Dodaj u crne"). Whoever answered "ne
dolazim" sinks to the bottom, dimmed and labelled, rather than disappearing: a
voditelj adding them is correcting a record and always means it.

**What the counts COUNT changes twice** (#620, CONTEXT.md → *Army count*):

- once the postava is **confirmed**, the bar, both column heads and the Bule
  card count the POSTAVA rather than the answers, the names and the number agree
  at last, and the "bez odgovora" chip is dropped because it has nothing left to
  explain;
- once the nastup has **started** (`startMs <= nowMs`, the same fact that
  already decides `canAlarm`, and never "confirmed"), the bar reads "8 crnih · 7
  bilih" instead of a shortfall, the heads drop their "od 8" and no army is
  called short. Nothing is missing from an evening that has been danced.

**Pozovi and Potvrdi postavu sit in the flow, under the Bule** (#620), with a
Lucide bell beside Pozovi. They were a sticky bar at `z-index: 15` until Josip
photographed the bottom of it being read through the tab bar: that zone is at
`z-index: 20` and up to 132px tall, so a lifted element below it is blurred out
by it and no `bottom` value clears something that follows the scroll.

**Potvrdi writes the postava and then confirms it**, in two calls. The titles
are stored the moment they are given, but the plain rows under them are derived
from answers that keep arriving, so saving the list as it stands on screen is
the only way the confirmed postava is the evening the voditelj was looking at.

**Six writes, five of them routes that already existed**: `POST
/api/app/attendance` for an answer on somebody's behalf and for the army move,
`POST /api/app/lineup` for a title (an unconfirmed replace of the whole list),
`POST /api/app/lineup/confirm`, `POST /api/app/performances/[id]/thresholds` and
`POST /api/app/alarm`, the last two both inside the **Pozovi** sheet (Q35: the
thresholds and the call-out are one decision seen from two sides). The sheet
shows the alarm before it sends it, and the preview is `PUSH_MESSAGES.alarm`
itself, so it cannot promise a sentence the phones will not get. Nothing on the
screen is optimistic: every landed write calls `router.refresh()` and the server
counts again.

**Stanje writes answers and titles, and preserves what it did not derive.** A
save from this screen is the answers plus the titles plus every stored row it
kept, never a list rebuilt from scratch. What it still cannot record is an
unusual role (a bula danced by a crni, story 29) or the `voditelj` line, so
**the old `LineupEditor` on the Izvedbe detail stays** until something here can:
it is the tweezers for a row Stanje has no control for, and #512 must not take
it away before then.

**A dancer reads the same screen with no action bar and no sheets on the
names.** The routes refuse them anyway (`requirePermission(req, 'moreska')`), so
the missing controls are honesty about the account rather than the lock. A
confirmed postava shows its titles to everyone, with a chip in the header.

What the screen SAYS is `src/lib/app/stanje-screen.ts`, pure and tested without
a database; what it can DO is `src/app/app/moreska/[id]/Stanje.tsx`, the one
client island.

Moreška's own top mark wears the title too: `RosterPerformance.myTitle` is the
reader's role in the next nastup's **confirmed** postava, folded in by
`attachOwnTitles` and null for a draft (story 34).

## Statistics (#437 — phase 4 batch C)

`/app/leaderboard`: one row per active moreškant for the selected season —
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

"Besplatne karte" on `/app/performances/[id]`: a dancer issues up to **four** free
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
  (`src/lib/performance-bulk-create.ts`), shared with `/api/shows/bulk-create`
  and with the voditelj's own Dodaj (#503): ONE transaction, and — for a batch of
  two or more — the per-create `skipRosterPush` flag plus the ONE summary push
  (#441 review), stated once, so a season entered from Claude behaves exactly
  like a season entered from `/admin` and a create that throws on row nine
  leaves nothing behind. A one-row call leaves the hook on and sends no summary
  (#503), so a single cruise call pasted into the chat announces itself like any
  other save.
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

A fixed bottom bar (`TabBar` in `AppNav.tsx`, one client island inside the
server `AppShell`) over the screens this account unlocks. Since #495 the bar is
computed rather than written down — the server hands it the `AppNav` that
`appNav()` built out of the permission set — and `activeScreenKey`
(`src/lib/app/screens.ts`) is the single rule for which tab a path lights up,
so a page below a tab lights its parent. The laptop renders the same nav as a
grouped sidebar from 1024 px up.

| Route | Tab | What it is |
|---|---|---|
| `/app` | Izvedbe | the next live evening as a hero, then the season by month, the past behind a disclosure |
| `/app/performances/[id]` | Izvedbe | one evening, three segments, the two answer buttons pinned above the bar |
| `/app/leaderboard` | Ljestvica | two panels (`?part=mine\|all`): the dancer's own season, and the ranking — the full scoreboard for a voditelj (#495) |
| `/app/more` | Više | the person (mark or permission chips), their four rows, the overflow screens, the app's own rows, Odjava, the build line |
| `/app/welcome` | none | the walkthrough: no bar, no brand header |
| `/app/install` | none | the full-screen install guide (#455), public by design: the QR target at a rehearsal |

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
   `Set-Cookie: cecilija_onboarded=1; Path=/app; HttpOnly; SameSite=Lax; Max-Age=31536000`
   (plus `Secure` when the request arrived over https). A **one-year** cookie
   has to come from a header: Safari's ITP caps a `document.cookie` write at
   seven days, so a browser-written one would quietly become "next week" and
   walk a dancer through the same three steps every Monday. The route sets a
   cookie and nothing else, and still carries the full `/app` gate — the
   cross-site check (`rejectAppRequest`) first, then
   `requirePermission(['moreskant', 'moreska'])`.
2. **`localStorage['cecilija.onboarding.done']`, the rescue.** The client
   writes it when the walkthrough ends and reads it **on mount** of
   `/app/welcome`: a device that has seen the walkthrough but lost its cookie
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
to `/app/install`, the full-screen version and the QR target at a rehearsal,
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
implemented. Two pure modules, both **downstream of `loadSeasonStats`**: they
rank the scoreboard's own rows rather than re-deriving a count, which is what
keeps the two panels of `/app/leaderboard`, the full list and the Početna card
from ever printing three numbers for one season.

| | |
|---|---|
| `src/lib/app/leaderboard-rank.ts` | the redesign's rules (#568): the two lists, the ranking, the cut, the pinned row, the standing |
| `src/lib/app/leaderboard-loaders.ts` | `buildLeaderboard`, the WHOLE season's ranking, which is now read only for the milestones on *Moja sezona* |

**One season is two lists** (#568, Q36). A *Moreška Experience* is danced by
three pairs in the society's own premises and a full evening by the whole
ansambl, so ranking both in one column told a dancer with twelve Redovne that
they were behind somebody with fifteen Experiences. `kindsOf` splits them off
`PERFORMANCE_KINDS`, so a seventh kind lands in the Moreška list rather than
falling out of both, and `SeasonStats.confirmedByKind` is what each list is
"out of".

- Only confirmed lineups count, every active moreškant is a row even at zero,
  and **a cancelled evening counts for nobody** — `loadSeasonStats` drops it
  since #568, which is the rule `my-season-loaders.ts` had applied alone since
  #457 and the reason one dancer's season could read 18 on the board and 17 on
  the panel beside it.
- **Competition ranking**: equal counts share a rank and the next rank skips
  (1, 1, 3). The rows are re-sorted by the LIST's own count (then nickname, `hr`
  collation), because a list of Experiences ordered by somebody's Redovne would
  be ordered by a number it does not show.
- **The cut is by POSITION, not by rank**: `boardView` shows twenty and offers
  the rest behind "Vidi cijeli popis", and cutting by rank would show a
  different number of dancers depending on how the season tied. A reader below
  the cut is **pinned** as a last row of their own ("ti · 24."), so the one
  number they opened the screen for is never behind a link.
- `myStanding` carries `toNextPlace` — how many more nastupa reach the next
  higher distinct count, null at the top — together with `nextPlace`, the rank
  that count already holds. `nextPlace` is **not** `rank - 1`: with ranks 1, 1,
  3 the dancer at 3 reaches 1 by tying, and 2 is a place nobody holds. Counted
  nouns go through `pluralize` (`roster-loaders.ts`), and the standing sentence
  takes the INSTRUMENTAL (`board.withCount`: "s 1 nastupom"), because
  `moreska.count` is the nominative and "s 1 nastup" reads as a typo.
- **Every mark is an army and every title is null.** A *titula* belongs to one
  evening's lineup and never to a person (CONTEXT.md → *Title*), so the disc
  comes from the profile's primary role (`SeasonStats.primaryRoles`, the one
  profile fact this payload carries — no mobile, no e-mail) and no crown is
  drawn. A season's counts contain no title anybody currently holds; #566's
  `lineupWithTitles` is one evening's draft and is not this screen's to read.
- `fullSeason` means the reader danced every confirmed evening of THAT list;
  milestones are 5, 10, 15, 20 read off the whole season's count and live on
  *Moja sezona* since #568, beside the split by kind. **No streaks as a season's
  number**, which is a decision rather than an omission — and #628's *niz* is
  not one: it is a run through the society's whole chain of confirmed moreške,
  it crosses seasons, nothing is ranked by it, and it rides on a row rather
  than being one of the figures the row is made of.
- **The niz and its flame** (#628, CONTEXT.md → *Niz*). The rules are
  `src/lib/app/niz.ts`, pure and tested without a database, and the whole
  decision is in the CHAIN: confirmed, non-cancelled, non-Experience evenings
  that have already happened, newest first. A niz is then the run of chain
  entries the dancer is in, counted from the front, and it is **zero the moment
  they miss the last one** — a broken run is not a shorter run. Three reads it
  where two screens would have had to agree: `niz-data.ts` loads the chain
  (capped at `NIZ_WINDOW`, about two seasons, because the number it caps has
  never existed) and its lineups, and hands `rankDancers` a `memberId → length`
  map; the screens draw `flameNiz(row.niz)`, which is the only place the
  threshold of 3 is spelled. The **profile's chain is uncapped**, because
  *Najduži niz* is a record and a record with a ceiling in it is not one; that
  read is one dancer's and small.
  Two things the drawing is careful about. **One state**: ember, filled, and
  only for a run still going, because a hollow "broken" flame was designed and
  dropped — against the real season it would have made six of ten flames a
  record of somebody who stopped in May, which is the profile's job. And **two
  sizes are two drawings**: the number sits BESIDE the glyph in a 16px row and
  INSIDE it at 46px on the profile, which is what every app in the survey does
  at those two sizes.
- The bottom of the list gets **no** treatment: no red, no "zadnji". A season
  with no confirmed postava of a kind says so once, in one line.
- `/app/leaderboard/full?season=&kind=` is the whole ranking of one list, same
  gate (`openScreen('leaderboard')`), lit as Ljestvica by the prefix rule in
  `activeScreenKey`. It is a PAGE rather than a "show more" button because a
  ranking of the whole roster appearing under a tap moves the row the reader was
  looking at; rendered on the server, whole, on first paint, there is no loading
  state to reflow. A `moreska` holder reads two lines more per row: which
  evenings the count is made of ("9 Redovna · 7 Adriatic DMC"), and quieter
  under it the titles worn in them ("2 × crni kralj · 1 × otmanović") — the four
  columns of the old `StatsTable`, which is where they live now that that table
  is gone. They come from `DancerStats.rolesByKind` (#568) summed over THIS
  list's kinds, **never** from `roles`, which is the whole season: a titles line
  drawn from the season sat beside a count that excluded the Experiences it was
  counting. `roles` keeps its #437 meaning; `rolesByKind` is a new field beside
  it, and only the four titles are in either — a plain crni or bili is an army,
  not a titula. Zeros are not printed, and a dancer who wore no title that
  season gets no line.

## Narudžbe (#501)

`/app/orders` and `/app/orders/[id]`, for a `tickets` holder: the blagajna's
list of orders, and the one order behind it. It is the first screen a `tickets`
login unlocks, so it is the first tab after Početna for one, and the first card
under the greeting (#564).

**The screen state is the URL.** `src/lib/app/orders-query.ts` parses `?q=`,
`?show=`, `?state=` and `?page=` and builds the address back; nothing about the
list lives in the browser. That is what makes a row survive a reload at the
door, and what lets Skener's "Otvori narudžbu" (`/app/orders/<id>`) and Izvedbe's
"Narudžbe za ovu izvedbu" (`/app/orders?show=<id>`) be plain links. A parameter
that is not one of the four states, not a whole page number or half a kilobyte
of search term resolves to something harmless: the query string is the one
input a stranger hands this screen directly. `page=1` is never written, so one
view has one address.

**The search runs as it is typed and the filters are chips** (#570, Q40/Q41).
The box debounces 300 ms and writes `q` with `router.replace`, so the address
still IS the state: a reload, a Back and a pasted link all keep the search. The
performance and state filters are rows of `FilterChips` (T1's shared shape, one
of them filled) rather than self-submitting selects, which is also why they
still work with JavaScript off. On the row and on the detail a comp order reads
**Gratis** where the amount would be, because `total = 0` is not a missing
price; `totalLabel()` in `orders-view.ts` decides that once for both.

**The four states are two questions in one control.** `active` / `refunded` ask
about the money (`refundStatus`), `partner` / `comp` about the channel. One
control rather than two, because Tatjana picks one at a time. The `where` is
built inside the seam (`src/lib/repo/payload/orders-where.ts`, unit-tested), and
the search is one OR over three columns — the name ANDed word by word so "ivan
horvat" finds "Horvat Ivan", the address as a `like`, the code as an exact
uppercase match.

**Four named actions, each behind a confirmation** (#476: named actions only, no
raw edit form):

| Action | Route | Notes |
|---|---|---|
| Povrat | `POST /api/orders/[id]/refund` | The idempotent engine, untouched. The button is decided on the SERVER by `refundOffer()`: `can(viewer, 'refunds')` first, so a `tickets`-only holder never receives it in the markup rather than receiving it disabled; then the order itself — already refunded, or nothing to refund (a comp, or a row with no payment intent), each says so instead of offering a button that would throw. The route re-checks `refunds` anyway. |
| Pošalji ulaznice ponovno | `POST /api/orders/[id]/resend-ticket-email` | Always to the address on the order. An order with none says so and offers the edit instead, which is the same rule the old `/admin` menu item carried. |
| Otvori PDF | `GET /api/orders/[id]/tickets.pdf` | A plain anchor: it is a file. |
| Uredi kupca | `PATCH /api/app/orders/[id]/buyer` | The one new route, and the only thing on the screen that writes. |

`PATCH /api/app/orders/[id]/buyer` carries `requirePermission(req, 'tickets')`
plus the `/app` cross-site guard, and its rules are pure and table-tested in
`src/lib/app/orders-buyer.ts`: a name is required (this repairs a name, it does
not delete one), a blank address is stored as NULL so "no e-mail" has one
representation, and **a refunded order is closed** — the money moved, the
tickets are void, and the buyer on it is part of what happened. The write goes
through `repo.orders.updateBuyer`, which is `payload.update` inside the seam, so
the Orders hooks run exactly as they do for a Backoffice edit.

**Not in v1, deliberately:** CSV export, deleting an order, editing counts,
total or channel, and the Tickets collection as a list of its own. What was sold
is a record; a miscount is corrected with an offline-sales line (ADR-0025) or a
refund, and the Backoffice keeps the raw edit for a `dev` holder.

**Money never comes from a join.** `OrderRow.totalCents` is the order's own
column: a SUM across the join to tickets multiplies the amount by the party size,
which is a bug this project has already had once.

**Povrat is not storno, and the screen says so.** The badge on a refunded row
reads *Povrat* and the state filter reads *Vraćene*, because in this project
*storno* names a specific different event: a ticket voided with
`cancel_reason='storno'`, where no money moved (CONTEXT.md, the partner and comp
void). The ticket line is where both can appear, as "Poništena · povrat" and
"Poništena · storno".

The screen reaches the database only through `getRepo()` (ADR-0027 decision 5),
so it adds no entry to the repo guard's allow-list. It grew the seam by four
methods: `orders.listForStaff`, `orders.staffDetailById`, `orders.updateBuyer`
and `shows.ticketedPerformances` (the performance filter's options, which are
the ticketed performances only — a non-public one has no orders).

## Upiti (#507)

`/app/inquiries` and `/app/inquiries/[id]`, for a `tickets` holder: the enquiry
inbox. Twenty-six enquiries had arrived through the two public forms before this
screen existed and not one of them had ever been marked anything, because the
only place to read one was a Payload list view nobody outside the developer
opens.

**It is a mailbox, so it is ordered like one.** Unanswered first, booking
enquiries (`private-moreska`, `moreska-experience`) lifted above general ones
within each state, newest first after that. The order lives in
`src/lib/repo/payload/inquiries-sql.ts` and is SQL rather than Payload's `find`
for one reason: both keys are *expressions*, not columns, and Payload's `sort`
can only name columns. Ordering a page in memory after fetching it would
reorder within the page and lie across pages, which is the bug a pager hides
best. The write still goes through the local API, which is the seam's rule.

**#570 changed how it looks and nothing else** (Q42): the rows are cards with
T1 chips, the state filter is the same row of `FilterChips` Narudžbe wears, and
the routes, the query parameter and the three views are exactly what they were.

**Which enquiries are bookings is not restated here.** `BOOKING_ENQUIRY_TYPES`
in `src/lib/dashboard/inquiries.ts` has owned that since #239; the Backoffice
badge, this screen's *Rezervacija* flag and the inbox's `ORDER BY` all read that
one list.

**The screen state is the URL**, as on Narudžbe: `?state=new|handled` and
`?page=`, parsed defensively in `src/lib/app/inquiries-query.ts`, with `page=1`
never written so a view has one address.

**Two named actions** (#476: named actions only, no raw edit form):

| Action | What it is | Notes |
|---|---|---|
| Odgovori | A `mailto:` anchor | Built on the server (`src/lib/app/inquiries-mailto.ts`): the enquirer's address, `Re: <the service, or "Vaš upit">` as the subject, and the message quoted with `> ` and CRLF under two blank lines so the cursor lands above it. Cecilija does **not** send mail and will not: Tatjana answers from `info@moreska.eu` in Gmail, where the thread and the sent copy belong. Everything is percent-encoded, because an unescaped `&` in a stranger's message would otherwise become a second `mailto:` parameter and `cc=` is one mail clients honour. The quote is shortened until the **encoded** href fits 1800 characters (`> [...]` marks the cut), because the encoded string is what the browser, the OS and the mail client actually carry: Croatian spends three characters per diacritic (`%C5%A1`), so capping the message instead would let exactly the enquiries this society receives open no compose window at all. The cut counts **code points**, never UTF-16 units — a `slice` landing inside a surrogate pair leaves a lone surrogate, `encodeURIComponent` answers that with `URI malformed`, and the page would 500 for one enquiry with an emoji in the wrong place. The whole message stays on the screen the button sits on. |
| Označi riješenim | `POST /api/app/inquiries/[id]/handled` | `requirePermission(req, 'tickets')` plus the `/app` cross-site guard, rules pure in `src/lib/app/inquiries-handled.ts`. The body is `{ handled: boolean }` — a **switch, not a toggle**: it says what the row should be, so the undo is the same button the other way round, two phones agree, and a retry after a flaky connection cannot flip the row back. Already in the target state answers the same 200 without a write. |

**Nothing on the screen edits the enquiry.** A stranger's name, address and
message are a record of what they wrote; the Backoffice keeps the raw edit for
the day a typo has to be repaired, and its "Mark handled" edit-menu item still
writes the same `contact_submissions.status` column.

**The count of unanswered enquiries is exposed, not yet placed.**
`countNewInquiries()` (`src/lib/app/inquiries-data.ts` → `repo.inquiries.countNew`)
is the one loader for it. The screens table carries no badge field and a screen
ticket does not change its contract (#495), so whichever of the landing strip or
a tab badge is decided (#471, #496) finds the number already behind the seam
rather than writing a second query for it.

The screen reaches the database only through `getRepo()` (ADR-0027 decision 5),
so it adds no entry to the repo guard's allow-list. It grew the seam by one repo,
`InquiriesRepo` (`list`, `byId`, `setHandled`, `countNew`).

## Gratis (#506)

`/app/comp`, for a `tickets` holder: the secretary hands a society member free
seats, takes one back when it was issued in error, and sees who has had how many
this season. A port of the Backoffice comp panel (`CompIssuePanel` /
`CompIssueForm`), not a redesign — ADR-0019 already decided everything that
matters and the two routes behind it are untouched.

**Three sections, and since #570 (Q44) the records come first.** Podijeli
gratis is one primary button at the top that opens the form in a `Sheet`; the
season table and Zadnji gratisi are the screen itself. Giving a comp away
happens a few times a season with somebody standing at the desk, while reading
the table is what the screen is opened for the rest of the time, and an
eight-control form sitting open pushed both records off a phone. The sheet
stays open after a comp is issued, because the answer (the code, whether the
e-mail left, the PDF to print) is in it.

| Section | What it does | Route behind it |
|---|---|---|
| Podijeli gratis | Izvedba picker with seats left, a REQUIRED member picker with search and an inline **Dodaj člana**, the two steppers, the holder name prefilled from the member, an optional e-mail | `POST /api/comp/issue`, plus `POST /api/comp/members` for the inline add |
| Zadnji gratisi | The eight newest comps, each expanding to its per-person tickets; **Poništi gratis** on the whole order or on one ticket | `POST /api/comp/cancel` |
| Gratis po članu | The season's comps per member: adult, child, issued and voided, with a season picker (`?season=`) | a read, through `repo.comp` |

**The member is required and the form says so by staying disabled.** Per-member
reporting is the whole reason a comp carries a Member link rather than a note
(ADR-0019), so an unattributed comp would be a seat nobody can account for. The
inline add exists because the person at the desk is sometimes not on the list
yet, and sending the secretary to the Backoffice mid-conversation is how a comp
ends up attributed to the wrong person. It creates a Member with a **name only**
— that is the shape of `repo.members.create`, and it is the refusal: a `tickets`
holder may add a member but may not write the moreškant fields, and a field the
method cannot carry is a field the route cannot leak.

**Three names live around a comp and the screen keeps them apart** (ADR-0019):
the `member` is who RECEIVED it and is never printed, the holder is what goes on
the slip (prefilled from the member, editable, and it stops prefilling the
moment it is touched), and whoever claims the QR overwrites the holder with
their own name.

**Poništi is a confirmation, not the partner's delete-then-undo,** and that is a
fact about the route rather than a matter of taste: `/api/comp/cancel` has no
undo endpoint, so a bar that drains would offer a way back that does not exist.
The sheet names what stops working and says the void cannot be taken back; a
ticket that has already been scanned says so above the button. A voided comp
stays on the list, struck through — a row that vanished would read as a comp
that was never issued. **Poništi reaches the eight newest comps and no further:**
an older one is voided in the Backoffice until a search over comps lands, which
is the same v1 line Narudžbe draws around its own history.

**Poništi is storno, never povrat.** No money ever moved through a comp
(`total = 0` by construction), so the word that means "the money went back"
would be a lie about the event; the void writes `cancel_reason='storno'` and
`channel='comp'` is what distinguishes it from a partner storno (ADR-0019, no
new enum value).

**The season table counts tickets, never money.** A SUM across the join to
tickets would multiply an order's total by its party size, and a comp's total is
zero anyway. The rule — a live ticket is *izdano*, a voided one is *poništeno*
and neither adult nor child — is pure and tested (`tallyCompsByMember` in
`src/lib/app/comp-screen.ts`); the query under it is a plain "every comp ticket
of this season". The season is the performance's calendar year, the project's
one definition of a season, and `?season=` resolves exactly as Ljestvica's does.
**It counts a dancer's self-issued comps too** (`compIssuedBy='self'`, #434):
those are `channel='comp'` orders attributed to that dancer's own Member, and
the table answers "how many comps did this member receive", which is exactly
what they are.

**The screen is called "Gratis", not the route map's "Gratis i kodovi"**
(`APP_STRINGS.screens.comp`): the second half of that name promised a thing the
page does not have. The table in `screens.ts` is untouched — a label is a
string, not a route.

**Promo codes are not here** and that is the #476 decision, not an omission:
none has ever been created, and the Backoffice's PromoCodes view stays the only
place one is made. The screen says so in a line at its foot.

The screen reaches the database only through `getRepo()`, so it adds no entry to
the repo guard's allow-list. It grew the seam by two repos: **`MembersRepo`**
(`listActive`, `create` — `/api/comp/members` was moved onto it in the same
change, so the Backoffice comp form and Cecilija share one list and one create)
and **`CompRepo`** (`recent`, `ticketsInSeason`, `firstSeason`), whose SQL lives
in `src/lib/comp/comp-report.ts` the way every raw statement does. There is no
comp WRITE in the seam and there must not be: issuing and voiding go through the
two existing routes, which take the per-show advisory lock and the `storno` void
primitive, and a second writer would be a second way to spend a seat.

## The skin: tokens, shapes and the shell (#562)

The visual redesign (map #560) lands as one system ticket and then screen by
screen. T1 is the system; everything under it is a screen's own ticket.

**Three files, and nothing else decides how Cecilija looks.**

| | |
|---|---|
| `src/app/app/app.css`, the `.app` block | the tokens: colour, shadow, radius, type, motion. Light on `.app`, night on `.app[data-theme="dark"]` |
| `src/app/app/ui/` | the shared shapes, fifteen of them, plus `ui.css` |
| `src/lib/app/screens.ts` | which screens exist, unchanged by the redesign |

### Vertical space: the parent's gap, never a child's margin (#627, #634, #636)

**The rule, and it holds on every `/app` screen.** The distance between two
things comes from a `gap` on the element that CONTAINS them. A block never
composes the space above or below itself with its own `margin`.

Two tokens, both on `.app` (`src/app/app/app.css`):

| | |
|---|---|
| `--gap: 20px` | between two widgets: card to card, section to section |
| `--gapTight: 12px` | between the blocks inside one widget |

20 and not 16, because the distance between two cards is what reads as cramped
on a phone: 16 is close enough to a card's own 18px padding that two cards read
as one surface with a seam in it.

**Why it is a rule and not a preference.** Josip has reported cramped widgets
twice, a few commits apart, on two different screens, and both times the cause
was the same: a screen whose container had no gap, spacing itself with whatever
margins its blocks happened to carry, several of which are `0`. A margin is a
rhythm one screen owns and the next screen forgets; a gap is a rhythm the
container keeps for anything ever put inside it. #627 gave the gap to the shell's
own floor, to Ljestvica and to Stanje; #634 gave it to the Ljestvica tabpanel, which
is what Moja sezona renders into.

Where a screen's own container has no class to hang a gap on, give it one
rather than reaching back into the children.

**And the shell is a container like any other (#644).** Its rhythm was a margin
floor, `.app__shell > * + *`, written weak on purpose in #592 so a block wanting
more air could say so and win the cascade. A floor a child can RAISE is a floor
a child can DELETE, and 143 rules in `app.css` did exactly that by saying
`margin: 0` for their own reasons — which is why another dancer's profile had
**0px** between two blocks where Moja sezona, rendering the same blocks into a
real flex column, had 20. The shell now carries `gap: var(--gap)` and its direct
children are given `margin-top: 0` by a two-class rule, because a one-class rule
would lose the same tie that caused the bug.

**#636 is the sweep that made it true everywhere**, and the bug it found is
worth keeping written down, because it is the reason the rule kept being broken
by screens whose CSS looked finished. `app__col` and `app__cols` — the two
laptop layouts — were declared **inside `@media (min-width: 1024px)` only**,
with a comment saying the two-column one "collapses to one column below this
width by simply not existing there". It did not collapse to one column: below
1024px both were inert `div`s with no display and no gap, so Prodaja, Obračun,
Članovi, Korisnici and the two detail screens under them had no rhythm of their
own at all, and each of their blocks pushed itself down with a margin. A
container that only exists on a laptop is a container that does not exist,
because the phone is where this app is read. Both now declare
`display: flex; flex-direction: column; gap: var(--gap)` at every width, and the
1024px block adds only the width of one and the second column of the other.

What the sweep converted, and the shape each screen ended up in:

| Container | Was | Is |
|---|---|---|
| `.app__col`, `.app__cols` | desktop-only, no gap on a phone | flex column, `--gap`, at every width |
| `.app__st`, `.app__fin` | `gap: 12px` + `margin-top: 16px` on the wrapper | `gap: var(--gap)`; the shell's gap spaces the wrapper |
| `.app__lb` | `gap: 28px` | `gap: var(--gap)` |
| `.app__scan` | `gap: 12px` + a `16px` top inside the bleed shorthand | `gap: var(--gapTight)` |
| `.app__more-group`, `.app__month-group` | `gap: 10px` + `margin-top: 22px` | `gap: var(--gapTight)`; the shell's gap spaces the groups |
| `.app__statement`, `.app__partner-season` | eleven child `margin-top`s | flex column, `--gap` |
| `.app__filters`, `.app__inbox` | `gap: 10px` + a top margin | `gap: var(--gapTight)` |
| `.app__fin-partners`, `.app__fin-lines` | every item's own `margin-top: 10px` | the list is a column with a gap |

Two exceptions, both deliberate and neither of them rhythm:

- **`.ui-podium:not(.ui-podium--lg)` keeps its `margin-top: 26px`.** That is the
  clearance the cup standing ABOVE the winner's step needs, so it belongs to the
  component and would break if a container took it over.
- **Text-level offsets inside one card stay** — a caption lifted 2px under its
  figure, a note 6px under a sentence. They are typography, not the distance
  between two blocks, and a single `gap` cannot express them without flattening
  the card. The rule is about the rhythm of a screen and of a widget's blocks.

Acceptance for this one is Josip's own iPhone: it is CSS with no behaviour to
assert, so the suite and the build say only that nothing broke.

### The follow-ups Josip found on his phone (#592)

Five skin decisions, every one of them settled on the prototype branch
(`prototype/cecilija-post-redesign`) before the ticket started, and every one of
them a port rather than a new design.

| | |
|---|---|
| **Dark palette A** | the night paper is one step lighter: `--bg #1f1913`, `--card #2c2419`, `--sunk #17120c`, `--track #43392f`. The old ground sat so close to the card that a card had nowhere to sit. Gold, ink and every accent untouched; the light skin untouched entirely |
| **The bar blurs the page** | `.app__tabbar` is a full-width fixed ZONE with the pill centred in it and three layers under it (a `--bg` gradient to 85 %, `blur(6px)` over 132px, `blur(18px)` over 84px, each masked out at its own top). Content scrolls to the bottom EDGE and goes out of focus there; `.app__shell` clears `tabH + safe + 12px` rather than `+ 40px`, which was the hole under the last card. **The zone must never carry a `transform`**: in WebKit a transformed ancestor is what a `backdrop-filter` descendant resolves against, and the blur silently does nothing. The header stays non-sticky |
| **The answer pair** | `src/app/app/AnswerPair.tsx`, one client component for the hero, a hero half and any row. Both buttons are ALWAYS on screen — the chosen one filled, the other outlined at .55 — and the words are always *Dolazim* / *Ne dolazim*, never the army (a dancer does not choose it, a voditelj can change it for one evening, and a label that moves under the thumb is not a label). The tap is the prototype's variant A: the blades redraw from opposite corners, the green (`--yes`, olive) expands from THEIR CROSSING rather than from the finger, a white ring and six sparks fire on the clash, the pressed button springs and the other eases back. *Ne dolazim* is the same shape without the sparks. `prefers-reduced-motion` drops all of it to a colour swap. The write, the optimistic update and the revert stay in `moreska/Answer.tsx`; `S.comingIn` and *Promijeni* are gone with the collapsed single button |
| **Copper on the hero too** | `ui/KindChip` is the DateDisc's three tones as a pill, for the places a hero has no disc: the hero meta on Početna and Moreška (through the shared `HeroMeta`, since both read one `heroView()`), each half of a two-nastup day, and beside the date on Stanje. `--onCopper` is white on both skins |
| **The crown carries an O** | and the dark-skin bug under it was NOT the crown: Više draws the reader's mark with no title by design (#569) and never passed the `initials` #573 added for exactly that case, while `.ui-mark--crni` hard-coded `#1a140c` instead of `--crni`, which at night is a shade off the page ground. An empty disc with no body of its own reads as a ring around nothing |

**Never hard-code a value a token names.** A theme re-points the token; a hex
does not follow it. `.ui-mark--crni` is what it costs when a rule does not: it
held `#1a140c` from T1 until #592 and the night skin could not follow it. The same rule is why Skener re-points tokens rather than
restating colours, and why the four answers a scanned ticket can give are
`--res-ok`, `--res-seen`, `--res-void` and `--res-bad` on that screen's root
rather than four hexes in four rules (#572). They are `--res-*` and not `--ok`
because the system already spends that name on an army that is strong enough
tonight.

**The night skin has a switch** (#569, T8). It is on Profil (`/app/account`),
under *Izgled*, and it is **almost** the only thing in the app that writes
`data-theme`. The other is Skener (#572, T11), which writes `dark` on its own
root and keeps it there whatever the reader chose, because the door works after
sunset and a white page is a lamp in the volunteer's face. That works because
the night block answers a DESCENDANT as well as `.app` itself
(`.app[data-theme='dark'], .app [data-theme='dark']`), which is what an island
is now: #490's `.app__night` was the same idea before the tokens had a theme to
belong to, and it is gone.

| | |
|---|---|
| three states | **Svijetla** (the default since #633) · **Tamna** · **Kao sustav** |
| stored | `localStorage`, key `cecilija.theme`, one value per device |
| applied | `data-theme="dark"` or `"light"` on `.app` (the `<body>`), always written out rather than removed, so the state can be read back off the element |
| no flash | `THEME_BOOT_SCRIPT`, inline in `src/app/app/layout.tsx` ABOVE everything it renders |

The rules live in `src/lib/app/theme.ts` and NOTHING re-types them: the boot
script is built from the same three constants the switch writes with, so a
renamed key renames itself in both. `ThemeSwitch.tsx` is a `useSyncExternalStore`
over localStorage and `matchMedia`, never a piece of state copied out of them in
an effect — the snapshot carries the CHOICE and the RESOLVED skin together,
because otherwise a phone flipping at sunset would move the skin without moving
the snapshot and nothing would re-render.

**Per device, never per account**, and that is the decision rather than an
implementation detail: which skin to wear is a fact of the phone in the hand —
its brightness, where it is being read — and a shared login (`tehnika` on a
wall, `member` in an office) has no single answer at all. So there is no column
on `Users` and there must not be one.

**"Svijetla" is the default since #633, and "Kao sustav" is the one
`prefers-color-scheme` in the app.** The default was the system setting until
Josip read the app on his own phone: a dancer whose phone is on dark at nine in
the evening met a screen nobody had designed for him, and the app should open
in the skin it was drawn in. The system setting stays as a state a person
CHOOSES, and choosing it survived the change — a stored `system` still follows
the phone, which is the half the ticket's own one-line fix (`p || 'light'`)
would have silently taken away from everybody who had picked it, because `p` is
null for a preference that is not a resolved skin. The Skener stays dark through
the tokens, not through this switch (T10).

**Four token names and two font variables are aliases, and they are meant to
die.** `--frame`, `--cardEdge`, `--radius` and `--rowY` were the old contract
and are still spelled across the screens the redesign has not reached;
`--font-inter` and `--font-ibm-plex-mono` are `next/font`'s, re-declared on
`.app` so that body copy is the system stack rather than Labrada without every
rule that names them being rewritten. Each screen ticket deletes its own
spellings. When the last one goes, so do the aliases.

**A shape goes in `src/app/app/ui/`, or it does not exist.** Button, Card, Hero,
Tile, ListRow, Chip, DateDisc, Note, Section, ArmyBar, RoleMark, Sheet, Toast,
Ring, Podium — plus, since #570, FilterChips (a scrolling row of link chips,
one of them filled: a filter is an address, so it is never a `Chip`, which is a
fact about a row) and, since #568, Segmented (two views of one screen, a sunk
track and a white thumb) and CountUp (a number that runs up once on first paint;
the server renders its FINAL value, so nothing reflows and a reader with no
JavaScript still reads the count), and since #571 **Seasons** (the row of year
pills, which was Ljestvica's own markup until Statistika and Financije needed
the same control: it is links, because a season is a server navigation) and
**Explain** (the "i" that keeps the rest of a caveat off the card and puts it in
a sheet), and since #572 a `size` on `Ring` (the door reads its count at arm's
length in the dark) and a `live` on `CountUp` (a number that changes while the
screen is open counts from what is ON SCREEN to the new value, never from zero,
and writes the value outright when the tab is hidden, because a hidden tab is
given no frames at all), and since #569 **Switch** (one thing this
device does or does not do; the whole 56px row is the target, and `aria-checked`
carries the state so a reader hears the state rather than a label they have to
interpret) and **ScreenIcon** (the icon map, which was `AppNav`'s private
constant until Više listed the overflow as rows and wanted the same drawing the
tab has). `Segmented` grew an `options` mode there rather than beside itself: a
setting with no panel behind it is a radiogroup, and a `role="tab"` whose
`aria-controls` points at nothing is a lie a screen reader repeats out loud.
`Podium` grew a `large` size there rather
than a screen-side override. A screen COMPOSES them; a screen does not restyle them, and a
screen that needs a further shape brings it here rather than inventing one
beside itself — inventing beside itself is exactly how the app ended up with
five kinds of button and no rule about which was primary. Only `Sheet` is a
client component; the rest render on the server.

Two rules travel with the shapes:

- **One primary button per screen.** If a screen wants two, the screen has two
  jobs. Red is destructive, always last, never without a confirmation.
- **The uppercase micro-label survives only as a section heading.** On a button
  or a chip it said nothing and made the whole app read as a printed programme.

**The shell.** The document never scrolls: `.app` (the `<body>`) is the scroll
container and `html` is `overflow: hidden`, which is what lets the tab bar be a
pill fixed to the viewport that no rubber-band can move. Two consequences worth
knowing before debugging anything:

- the top of the scroll is `document.body.scrollTop`, **not**
  `document.scrollingElement.scrollTop`, which stays 0 forever here;
- `PullToRefresh` adds `will-change: transform` for the length of the gesture
  and takes it off again. Left standing it would make that wrapper the
  containing block of every `position: fixed` descendant — the scanner overlay,
  a sheet — for the whole life of the screen.

Pull to refresh arms only at the top of the scroll and only downwards, calls
`router.refresh()`, and does nothing at all under `prefers-reduced-motion`.

**The persistent chrome lives in `src/app/app/(shell)/layout.tsx` since #593.**
The sidebar, the floating bar and the pull gesture are rendered there, once, so
a tab tap no longer tears them down and builds them again — which is what makes
the bar's thumb actually slide (the CSS transition was always on it; nothing
survived long enough to run it). `(shell)` is a route GROUP: the parentheses
change no URL, and what the folder does is draw the line between the screens
that wear the chrome and the pages that must not (`login`, `forgot`, `session`,
`join/[code]`, `install`, `authorize`, `welcome`), which stay one level up. The
viewer is resolved once in that layout and `resolveAppViewer` is wrapped in
React's `cache`, so the page's own `openScreen()` reuses it rather than asking
Payload twice; **the gate stays on the page**, because a layout cannot refuse a
screen it does not know the name of.

`AppShell` is what is left: the header and the `app__shell` column, rendered by
every page.tsx, and it still REMOUNTS on every client navigation — which is
right, because a title and a screen's own actions are per-page. Anything that
has to survive a navigation still cannot hold its state there: `ScrollMemory`
lives in the ROOT `layout.tsx` for exactly this reason (#562 review), a level
above `(shell)`, because the pages outside the group scroll too.

**The laptop** hides the bar, sets `--tabH: 0` so everything that clears a bar
has nothing to clear, and offers two layout classes for a screen to opt into:
`.app__col` (760px, a list or a form) and `.app__cols` (a detail: what happened
on the left, what you can do on the right).

