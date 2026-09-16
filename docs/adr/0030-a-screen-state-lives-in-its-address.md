# ADR-0030: a screen's state lives in its address

- **Status:** accepted
- **Date:** 2026-09-16
- **Issue:** #666
- **Supersedes:** nothing. Narrows the habit #562 started (`ScrollMemory`) into a rule.

## Context

Josip, from his phone: *"Vraćanje unatrag — nije dobro u aplikaciji. Npr, u moreska tabu, kliknem na prosle izvedbe, udem u moresku, i kad se zelim vratiti na popis moreski, vrati me na pocetak liste, a ne tamo gdje sam bio. Takoder, za korisnici, ako filtriram nema app, udem u koirsnika, i vratim se, ne ostane mi filtar nema app."*

Two examples, and they had three separate causes. That is the reason this is an ADR and not a patch: each cause had been fixed locally on the screen where it hurt, and the next screen grew it back.

1. **Back was never Back.** Every detail screen carried `<Link href="/app/orders">` and called it a way back. A push is not a pop, so there was nothing for the browser to restore; the address it pushed was the bare list root, so the filter went with it.
2. **State the browser owned died on every navigation.** `ScreenTransition` wraps the page in `<div key={pathname}>` to drive the 200 ms slide, which fully remounts it. The Članovi search and its four chips were `useState`. Both "Prošle izvedbe" harmonicas were a native `<details>`.
3. **The scroll offset had nowhere to land.** `ScrollMemory` (#562) was already right — it saves on every scroll, restores on `popstate`, and the pure half is tested. It simply never got a `popstate`, and on the one screen that did produce one the harmonica had folded, leaving a page a screen and a half shorter than the one the reader left.

The underlying shape: each screen decided for itself where its state lived, and four of the nine chose somewhere a history entry cannot see.

## Decision

**Everything that changes WHAT YOU SEE lives in the address.** A search term, a filter chip, a page number, a segmented control, an open disclosure. The address is the history entry, so state that lives there comes back by construction — no screen has to remember anything, and no future screen has to be told to.

Four rules hang off it.

**1. A filter REPLACES the address, it never pushes.** Back must take the reader off the screen, not undo their last chip one tap at a time.

**2. There are two ways to write it, and the choice is decided by who filters.** A screen the *server* filters (Narudžbe, Upiti) navigates, because a new address is a new answer from the database. A screen the *browser* filters (Članovi, a disclosure) mirrors with `history.replaceState` and does not navigate at all: every screen in `/app` is `force-dynamic`, so a router call per keystroke is a database round trip per letter, in a hall, on a bar of 3G. Both produce the same address, which is the point — Back cannot tell them apart and neither can a reader who pastes one into a chat.

**3. Opening state is read from the ADDRESS by the component that owns it, with `useSearchParams` — never parsed by the server and handed down as a prop.** This is the rule that was written the other way round first, and it is worth recording why it flipped, because the wrong version looks better: the server can put the filtered roster straight into the HTML, and reading it on the client means the first frame carries all seventy-six members. The flaw is that on a **Back** the Next router rebuilds the page from the tree stored on the history entry — the tree from before the address was mirrored — so the server's answer is the stale one and the props say "Svi" while the address says `?f=no-app`. That is the exact journey this ADR exists for. `useSearchParams` reads the router's canonical URL, which `popstate` updates from `window.location`, so it is right on a Back; and because every `/app` screen is `force-dynamic` it is right during the server render too, so a shared link still arrives filtered with no flash. The prop version was wrong on the one case that matters and right on the one that did not.

**4. Back is a real `history.back()`, except where there is nothing of ours behind.** A push notification opens one nastup directly and `history.back()` there walks the reader out of Cecilija. So the control counts: `lib/app/nav-memory.ts` keeps how many of our own screens are behind this one, in `sessionStorage`, and `BackControl` asks at the click rather than at mount. It stays an `<a>` with a real `href` — the fallback for that reader, the answer with no JavaScript, and what keeps Cmd-click working on the laptop.

And one thing deliberately NOT in the address: a sheet. A legend, a person picker, a confirmation is something the reader *opened*, not something the screen is *showing*, and a Back that lands on an open sheet is a ghost.

## Consequences

- **A tab tap and a Back now mean different things, on purpose.** The tab is the bare address ("start fresh"); Back is the entry the reader came from ("put me where I was"). A filter that survived a tab tap would have a voditelj open Korisnici next week, see 6 of 49 people and no reason why.
- **Two long-standing bugs fell out of writing the rule down.** Ljestvica's segment called `window.history.replaceState(null, …)` itself, and that `null` throws away Next's own per-entry `key` — which is what `ScrollMemory` looks the offset up by, so switching panels quietly cost the screen its place. And Korisnici's search was a native GET submit, whose own comment called "the back button undoes it" a feature; it is not, and it is why Josip named that screen. Neither was found by looking for bugs. Both were found by having a rule to compare four screens against.
- **Nine screens changed and the next one is free.** `screen-state.ts` is the arithmetic, `ParamDetails` is the disclosure, `useMirrorState` is the writer, `BackControl` is the chevron. A new list screen spends three lines, and a new list screen that spends none will visibly misbehave, which is the enforcement.
- **Addresses are shareable now, and that is a consequence rather than a feature.** `/app/members?f=no-app` is a real link a voditelj can send. Nothing in `/app` is public, so it is a link to a screen the recipient must already unlock.
- **`RawSearchParams` has one definition.** `orders-query.ts` and `inquiries-query.ts` had each grown their own, which is how two screens that page through a list ended up with two ideas of what a page number is.
- **The scroll fix from #562 starts working.** It was correct the whole time and was never reached. This is the second time a mechanism here was right and unwired; the rule that catches it is that a fix is not verified until the path that triggers it is walked on a phone (#662, `feedback_phone_verify_before_done`).
- **The count can run ahead of the truth.** `router.replace` adds no history entry but does change the address, and the wiring cannot tell it from a push. Over-counting can only turn a Back on, and replaces happen on list screens, which carry no back control. Under-counting would turn a working Back into a link, and nothing can produce it.

## Alternatives considered

**Keep the links and carry the filter in them.** Each row's href would take the list's query with it, and the detail's back link would hand it back. It restores the filter and not the scroll offset, it puts the list's state in every row of the list, and it goes stale the moment a screen grows a second filter. Rejected: it pays most of the cost for half the fix.

**Stop remounting the page.** Drop `key={pathname}` from `ScreenTransition` and `useState` survives on its own. That deletes the slide animation the redesign is built on, and it only helps state React owns — a `<details>` would still fold. Rejected: a large loss for a partial fix.

**Keep state in `sessionStorage` per screen.** It survives a remount and is invisible to the address, so two tabs share one filter, a reload restores a filter the reader cannot see, and nothing is shareable. Rejected: the address already is this storage, with the right lifetime.
