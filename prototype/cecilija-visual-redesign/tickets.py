"""Creates the Cecilija redesign wayfinder map + tickets on GitHub, links sub-issues and blockers.
Run alone: python3 tickets.py   (idempotent-ish: re-run only after checking `gh issue list`)."""
import json, subprocess, time, os, re, sys

TMP = os.path.dirname(os.path.abspath(__file__))
PLAN = 'https://claude.ai/code/artifact/b63a989f-e765-4b02-bb43-2be86bca735c'
PROTO = 'https://claude.ai/code/artifact/ecd3f32d-b14e-460a-b6be-421874d4cf03'
BOARD = 'https://claude.ai/code/artifact/60074106-c946-4103-85d2-6774ec80d3dd'
AUDIT = 'https://claude.ai/code/artifact/db933451-9b3d-45c3-8ada-71194325b296'

FOOT = ("\n\n---\nDecision record: the plan artifact (" + PLAN + ", decisions Q1-Q67), the prototype (" + PROTO +
        "), the direction board (" + BOARD + ") and the audit (" + AUDIT + "). The glossary terms that changed "
        "(two registers for a performance, *Title*) live in `CONTEXT.md` on the branch `worktree-cecilija-visual-redesign` until T0 lands. "
        "Croatian copy without em dashes; every URL segment English; permission checks through `can()` only; "
        "no re-typed screen table (`src/lib/app/screens.ts` is the single source). Implementation model: Opus; review: Fable.")

def run(cmd, retries=3, input=None):
    for i in range(retries):
        p = subprocess.run(cmd, capture_output=True, text=True, input=input)
        if p.returncode == 0:
            return p.stdout.strip()
        time.sleep(2 + 2 * i)
    raise SystemExit('FAILED: ' + ' '.join(cmd) + '\n' + p.stderr)

def create(title, body, labels):
    path = os.path.join(TMP, 'body.md')
    open(path, 'w').write(body)
    cmd = ['gh', 'issue', 'create', '--title', title, '--body-file', path]
    for l in labels:
        cmd += ['--label', l]
    url = run(cmd)
    n = int(re.search(r'/issues/(\d+)', url).group(1))
    print('created', n, title)
    return n

def gql(query):
    return json.loads(run(['gh', 'api', 'graphql', '-f', 'query=' + query]))

def node_id(n):
    return gql('{ repository(owner:"jivancevic", name:"sveta-cecilija") { issue(number:%d) { id } } }' % n)['data']['repository']['issue']['id']

MAP_BODY = """## Destination

**Cecilija looks and behaves like a premium app**: a dancer wants to open it every day, Tatjana works in it on a laptop without effort. One app-native design system derived from the brand (paper, ink, gold as the only accent), rounded, layered, with feedback on touch; a new Početna, Moreška split from Izvedbe, Stanje as one screen, per-account tabs. Everything else changes only its skin. Reached when Josip says "premium" for every merged screen on his phone, three hallway tests (a dancer, Tatjana, a tehnika) pass without a "where is..." question, and no buyer-facing flow changed.

## Notes

- The decision record is the plan artifact """ + PLAN + """ (Q1-Q67), the prototype """ + PROTO + """ (the system contract: tokens, type scale, components, motion, dark theme) and the direction board """ + BOARD + """. Read the plan before re-opening any decision listed there.
- Domain glossary: `CONTEXT.md`, entries *Performance / izvedba* (two registers, decided 2026-09-13), *Attendance* (a dancer never picks an army) and *Title (titula)* (exactly one crni kralj, bili kralj, otmanović and bula per confirmed lineup). T0 lands the glossary commits on main.
- Tickets are built one screen at a time by an Opus agent in its own worktree, one PR each, merged only on six green checks; Fable reviews. At most two agents in parallel. T1 is the only ticket that touches every screen, and only through the shell and tokens.
- Hallway tests run on the prototype in parallel with T1; a finding edits the ticket of that screen before an agent starts it.
- The prototype sources go to the branch `prototype/cecilija-visual-redesign`, never to main.

## Decisions so far

- 2026-09-13: direction B ("Podij") with Josip's changes; hero on a white card; split army bar; role marks; fixed pill tab bar; pull-to-refresh; per-account tabs; Izvedbe unlock for `moreska` and `tickets` alike with action-level gating; a confirmed lineup carries exactly four titles.

## Out of scope

- Backoffice screens (#512 retires them separately). Buyer-facing site and e-mails. New features beyond the plan (the plan is a skin plus the four IA changes: Početna, Moreška/Izvedbe split, Stanje, per-account tabs).
"""

T = []  # (key, title, body, labels, blocked_by keys)
T.append(('T0', 'Redesign T0: land the glossary changes and point the agent docs at the plan', """Merge the two glossary commits on `worktree-cecilija-visual-redesign` (15f13f8 two registers for a performance; 336362a *Title*) into main through a PR, and add one line to `docs/agents/moreskant-app.md` under "The look" pointing at the redesign plan and its system contract.

## Acceptance
- `CONTEXT.md` on main carries *Two registers, one entity* under *Performance / izvedba* and the new *Title (titula)* entry.
- `docs/agents/moreskant-app.md` names the plan artifact as the design decision record for `/app`.
- No code change.""", ['wayfinder:task', 'ready-for-agent'], []))

T.append(('T1', 'Redesign T1: design system and shell (tokens, components, fixed pill tab bar, pull-to-refresh, dark theme)', """Replace the `.app` token block in `src/app/app/app.css` (lines 11-45) with the system contract from the prototype and build the shared shell. This is the only redesign ticket that touches every screen, and only through the shell and the tokens: no screen changes its data or its actions here.

## Build
- **Tokens** (light + dark under `.app[data-theme="dark"]`): `--bg #f5f2ec/#17120c`, `--card #fff/#231c14`, `--sunk #ede9e0/#100c08`, `--ink #1a140c/#f5f2ec`, `--muted #6b6259/#a89e91`, `--gold #b8881a/#d9ab3c`, `--goldText #8f6a10/#e3b94e`, `--goldSoft 12%/14%`, `--red #8b0000/#b3262f`, `--warn #a8321f/#e07a5f`, `--ok = goldText`, `--crni #1a140c/#050403`, `--track #fff/#3b322a`, `--rule`, `--ghostEdge`, `--barBg`, three shadows (card / hero / bar), radii 22 / 16 / pill, `--serif` Labrada for titles and numbers only, `--sans` system stack for everything else, `--ease cubic-bezier(.2,.8,.2,1)`, `--spring (.34,1.4,.64,1)`. `--radius: 0` and the dashed card edge disappear everywhere.
- **Type scale** 11 eyebrow / 13 small / 15 body / 16 button / 22 wordmark / 26 name / 34 screen title / 80 hero day. **Spacing** 4 8 12 16 20 24; card padding 18 (hero 20); gap 12; screen edge 20; touch target 44, button 52, list row 72.
- **Shell**: the document never scrolls; `.app` is the scroll container (100dvh, `overscroll-behavior: none`, no visible scrollbar). Floating pill tab bar 64 px, fixed, five tabs, dark pill on the active tab (goldSoft in dark), safe-area padding. Laptop: the sidebar keeps reading `screens.ts`; layout classes for 760 px centred lists and two-column details (Q51).
- **Pull-to-refresh**: only from scrollTop 0, elastic to 110 px, armed at 72 px, a gold ring that fills with the pull, spins 900 ms, calls `router.refresh()`, settles with the spring, toast "Osvježeno · hh:mm"; nothing under `prefers-reduced-motion`.
- **Shared components** under `src/app/app/ui/`: Button (primary gold with gold shadow, ghost, link, done, destructive; press scale .97 120 ms; the answer confirmation pops and draws its check), Card, Hero, Tile, ListRow, Chip, DateDisc (gold for Redovna, sunk otherwise), Note, Section, ArmyBar (crni fills leftwards from the centre in ink, bili rightwards in red, 0-12 per half, gold tick at the threshold, count below the threshold in warn + "Fale još N", above "Ima nas dovoljno"), RoleMark (44/28 px disc in the army colour; glyph = the title for THIS nastup: grey crown with base = crni kralj, grey crown without base = otmanović, gold crown on red = bili kralj, gold disc = bula, white ring = the bula of the night), Sheet (28 px top radius, grab handle, 60 px options), Toast, Ring (conic, 72 px), Podium.
- **Icons**: Lucide (stroke 1.75, active 1.9), custom crossed swords for Moreška; no emoji in navigation.
- The prototype's HTML is the reference for every measurement: """ + PROTO + """.

## Fixes folded in
- The sticky answer bar overlapping the laptop sidebar (audit) disappears with the shell.
- The header bell shows "1" on the Notifications screen itself (audit): fix the count source.

## Acceptance
- All 13 existing screens render and work with the new shell; no data or action changed.
- Verified in the real Chrome through the MCP at 390 px and 1200 px, logged in; screenshots on the PR.
- `npm run lint-types` and the test suite green; `repo-guard.test.ts` still passes.""", ['wayfinder:task', 'ready-for-agent'], ['T0']))

T.append(('T2', 'Redesign T2: per-account tabs (Users.tabs, generic order in screens.ts, "Tabovi" action in Korisnici)', """Tabs are chosen per account by a `users` holder; nobody edits their own. Decisions Q52, Q56, Q57, Q60.

## Build
- `Users.tabs`: an ordered list of up to 3 screen keys, field-locked to `users` like `permissions`; Početna and Više are always present and never stored.
- `PATCH /api/app/users/[id]/tabs` behind `requirePermission(req,'users')`; refuses the caller editing their own row (409) and a key the account's permission set does not unlock (400).
- Generic order in `screens.ts` when `tabs` is empty: moreskant → Moreška · Ljestvica; door → Skener; partner → Prodaja · Obračun; season_stats → Statistika; finance → Financije · Statistika; tickets → Narudžbe · Izvedbe · Upiti; moreska → Moreška · Članovi · Izvedbe; a multi-permission set merges dancer → box → other, first three win. `navFor` reads `tabs` first. MAX_TABS becomes 3 + Početna + Više; Više lists every other unlocked screen.
- Sixth action "Tabovi" on the Korisnici detail (a sheet with the unlocked screens as reorderable chips).
- Data: Josip = Moreška · Statistika · Ljestvica; Tatjana = Narudžbe · Statistika · Upiti; Luka Brkić = Moreška · Skener · Ljestvica; Branimir: ask Josip in the PR.

## Acceptance
- Unit tests for the generic order, the merge and the 3-key cap; the route tests for 409 / 400.
- The phone bar, the laptop sidebar and the active-tab highlighter all follow `tabs` without re-typing the table.""", ['wayfinder:task'], ['T1']))

T.append(('T3', 'Redesign T3: Početna (the new home tab)', """`/app` stops redirecting; it becomes Početna. Decisions Q16, Q26, Q59, Q61.

## Build
- Header: logo + wordmark "Cecilija" (the only screen with the logo) + bell with unread count.
- Greeting by time of day and first name, no vocative ("Dobra večer, Josip."), and one sentence about the next nastup or izvedba ("Sutra je nastup.").
- One card per tab in the account's tab order plus a fourth Obavijesti card; max four. Moreška card = the hero of the next nastup (day 80 px, venue · time · kind, Dolazim / Ne dolazim, then the ArmyBar, tappable into Stanje); Statistika card = a ring with tickets sold for the next public izvedba over capacity; Ljestvica card = podium of the top three + "ti si N. s M"; Narudžbe, Upiti, Skener, Prodaja, Financije, Članovi, Izvedbe cards = one figure and one action each.
- A card whose screen the account does not unlock is not rendered.

## Acceptance
- Josip, Tatjana, Luka Brkić, the shared `tehnika` and `member` logins each see their own four cards (screenshots on the PR).
- The attendance answer on the card writes through the existing `POST /api/app/attendance` and re-renders without a full navigation.""", ['wayfinder:task'], ['T2']))

T.append(('T4', 'Redesign T4: Moreška (the dancer register screen)', """New screen key `moreska` at `/app/moreska`, unlocked by `moreskant` and `moreska`; Izvedbe stops serving `moreskant`. Decisions Q17, Q18, Q29, Q30, Q31, Q61, Q65.

## Build
- Top: full name, primary role and the 44 px RoleMark; "N nastupa pred tobom".
- Hero of the next nastup: day 80 px, weekday · time · kind, the voditelj note, Dolazim / Ne dolazim; after answering the hero shows "Dolaziš · <army>" or "Ne dolaziš" with Promijeni (Q30); the ArmyBar is tappable into Stanje.
- List by month (Rujan, Listopad...), DateDisc gold for Redovna; a non-regular nastup reads **"Vanredna"**, never the client or the kind name; a state chip per row (bez odgovora / dolaziš / ne dolaziš). No sales figure anywhere on this screen (Q29); no "add" (Q31, performances are created on Izvedbe).
- `POST /api/app/attendance`: a dancer never sends an army; if one arrives from a dancer it is ignored and the answer counts in the army of the primary role (glossary *Attendance*). A voditelj still answers on someone's behalf.
- The push message and the leaderboard keep the dancer register ("nastup").

## Acceptance
- A `moreskant`-only login lands on Moreška and never sees Izvedbe in the bar or in Više.
- A dancer holding both armies answers with one tap and lands in the primary role's army (test).""", ['wayfinder:task'], ['T1']))

T.append(('T5', 'Redesign T5: Stanje (attendance and lineup on one screen, titles)', """`/app/moreska/[id]`: one screen for who is coming and who dances what. Decisions Q19, Q34, Q35, Q64, Q65, Q66; glossary *Title (titula)*.

## Build
- ArmyBar on top, then two columns: crni left, bili right, each with the count vs threshold, the people who said "coming" (RoleMark 28 px + nickname), dashed "mjesto N" placeholders up to the threshold; a Bule card; "Bez odgovora · N" opening the list.
- Voditelj actions in a sticky glass bar: Pozovi (a sheet with the message and the thresholds, Q35) and Potvrdi postavu; answer on someone's behalf and move a dancer between armies from the person sheet.
- Titles: tapping a name opens a sheet with the titles valid for that army (crni: Crni kralj, Otmanović; bili: Bili kralj; bule: Bula; plus Bez titule); each title has exactly one holder, giving it to someone else takes it away; "Titule N od 4" above the actions.
- `POST /api/app/lineup` refuses to CONFIRM a lineup that does not carry exactly one crni_kralj, one bili_kralj, one otmanovic and one bula (400 with a Croatian message); an unconfirmed write (including the MCP `set_lineup`) still passes.
- A dancer sees the same screen without the action bar; a confirmed lineup shows the titles to everyone.

## Acceptance
- Route tests for the four-title rule on confirm and for the MCP path staying open.
- Voditelj and dancer screenshots at 390 px on the PR.""", ['wayfinder:task'], ['T4']))

T.append(('T6', 'Redesign T6: Izvedbe (the blagajna register) with action-level gating', """Decisions Q32, Q53, Q58.

## Build
- Unlocked by `moreska` and `tickets` alike, public and non-public rows; both create and edit (date, time, venue, kind, isPublic, note). The detail title is the date.
- Public row: sold of capacity, channel split, per-show numbers as today.
- Otkaži (needs `tickets` + `refunds`), Premjesti termin, Pauziraj prodaju, Offline prodaja need `tickets`; without it the button is greyed with "traži Blagajnu" and the route refuses (gating per action in the handler, never per row).
- New skin per the system contract; nothing dancer-facing stays here (it moved to Moreška, T4).

## Acceptance
- A `moreska`-only login creates a public performance and cannot cancel it (UI and route test).""", ['wayfinder:task'], ['T1']))

T.append(('T7', 'Redesign T7: Ljestvica (podium, my season, full list)', """Decision Q36.

## Build
- Segment: Ljestvica first, Moja sezona second. Under Ljestvica a "Moreška" list (every kind except `experience`) then an "Experience" list; top 20 + "vidi cijeli popis" at `/app/leaderboard/full?season=&kind=`.
- Podium of the top three (rise animation), my row highlighted, the count that counts up on first paint; RoleMark 28 px beside each nickname (titles come from confirmed lineups only).
- Milestones as today; no streaks.

## Acceptance
- Equal counts share a rank; the full list is paginated or fully rendered without layout shift.""", ['wayfinder:task'], ['T1']))

T.append(('T8', 'Redesign T8: Više, Profil and Obavijesti', """Decisions Q20, Q48, Q49, Q21.

## Build
- Više: person header (name, role mark or permission chips), rows Profil · Obavijesti · Sigurnost · Podrška, then every other unlocked screen as rows; bottom "Cecilija · <version> (<commit>)" and, very small, "Created by: Josip Ivančević".
- Profil (`/app/account`): dark-theme switch (writes `data-theme`, persisted per device), push as a switch (Q49), the member link as today.
- Obavijesti: "Označi sve pročitanim" as quiet text on the right; the calendar link lives under Obavijesti.

## Acceptance
- The version line reads the same commit `/api/health` reports.""", ['wayfinder:task'], ['T1']))

T.append(('T9', 'Redesign T9: Narudžbe, Upiti and Gratis (blagajna skin)', """Decisions Q40, Q41, Q42, Q44.

## Build
- Narudžbe: search as you type (debounced, query string kept), filters as chips, "Gratis" instead of "0,00 €", the detail's Povrat last and quiet; the other three actions unchanged.
- Upiti: skin only.
- Gratis: the season table first, the issue form in a sheet with the member picker; Poništi behind its confirmation as today.

## Acceptance
- No route changes; the PII scan tests still pass.""", ['wayfinder:task'], ['T1']))

T.append(('T10', 'Redesign T10: Statistika and Financije (skin)', """Decisions Q45, Q46.

## Build
- Statistika: a segmented season picker, charts recoloured through the tokens, never money.
- Financije: the first sentence of each explanation stays, the rest behind an "i" popover; the two cards never summed.

## Acceptance
- `finance-no-pii.test.ts` and the finance view tests pass unchanged.""", ['wayfinder:task'], ['T1']))

T.append(('T11', 'Redesign T11: Skener (dark theme, bigger ring, counting number)', """Decision Q43, Q21.

## Build
- The whole screen in the dark token set regardless of the user's theme; a bigger "ušlo X od Y" ring; the count that counts up when a ticket is admitted; the four result states in the semantic colours; the manual-admit search as a sheet.

## Acceptance
- Camera flow untouched (the fixes from the scanner reliability work stay); verified on a phone in the real Chrome.""", ['wayfinder:task'], ['T1']))

T.append(('T12', 'Redesign T12: Članovi, member profile and Korisnici', """Decisions Q37, Q38, Q39, Q47.

## Build
- Članovi: the list first, invitations behind one icon; each row an avatar with initials, nickname, army dot, a quiet login mark; filter chips.
- Member profile: head + quick actions + the form with Spremi.
- Korisnici: name first, username second, permissions as soft pills with "+N"; the sixth action "Tabovi" from T2 sits with the other five.

## Acceptance
- Routes unchanged; the `name`/`note` refusal and the shared-account rules still tested.""", ['wayfinder:task'], ['T1', 'T2']))

T.append(('T13', 'Redesign T13: Prodaja and Obračun (partner skin, last)', """Decision Q50.

## Build
- Skin only on the five existing `/api/partner/*` routes; laptop widths per Q51; no flow change.

## Acceptance
- A partner login with no Partner link still gets a sentence and no figure.""", ['wayfinder:task'], ['T1']))

if __name__ == '__main__':
    out = {}
    map_n = create('Cecilija redesign: a premium app-native skin and four IA changes (wayfinder map)', MAP_BODY, ['wayfinder:map'])
    out['map'] = map_n
    for key, title, body, labels, blocked in T:
        blk = ''
        if blocked:
            blk = '\n\nBlocked by ' + ', '.join('#%d (%s)' % (out[b], b) for b in blocked) + '.'
        n = create(title, body + blk + '\n\nPart of the map #%d.' % map_n + FOOT, labels)
        out[key] = n
    json.dump(out, open(os.path.join(TMP, 'tickets.json'), 'w'), indent=1)
    print(out)
    map_id = node_id(map_n)
    ids = {k: node_id(n) for k, n in out.items() if k != 'map'}
    for k, iid in ids.items():
        gql('mutation { addSubIssue(input:{issueId:"%s", subIssueId:"%s"}) { issue { number } } }' % (map_id, iid))
        print('sub', k)
    for key, title, body, labels, blocked in T:
        for b in blocked:
            gql('mutation { addBlockedBy(input:{issueId:"%s", blockingIssueId:"%s"}) { issue { number } } }' % (ids[key], ids[b]))
            print('blocked', key, 'by', b)
    subs = gql('{ repository(owner:"jivancevic", name:"sveta-cecilija") { issue(number:%d) { subIssues(first:40) { nodes { number } } } } }' % map_n)
    print('sub-issues on map:', [x['number'] for x in subs['data']['repository']['issue']['subIssues']['nodes']])
