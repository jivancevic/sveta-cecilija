# ADR-0028: A moreškant owns their own way in

**Status:** Accepted
**Date:** 2026-09-16
**Amends:** [ADR-0024](0024-moreskant-roster-domain.md) (the roster's PII boundary) and reverses the "a dancer need never have a password" half of #463.

## Context

Since #463 the invitation LINK is what signs a dancer in. That was a deliberate reversal of the password form, and the reasoning is still sound for the moment it describes: on the production roster **one moreškant out of seventy-six has an e-mail address** (`src/lib/app/invite.ts`), so requiring one would have been a wall in front of the people the society reaches by phone. A voditelj mints a seven-day link, sends it by SMS, and the dancer is in without inventing anything.

Living with it through a season showed what that design does NOT cover, and none of it is visible from inside the app:

- **The session is thirty days and does not slide.** `Users.auth.tokenExpiration` is `60 * 60 * 24 * 30` and nothing under `/app` refreshes it. A dancer who signed in on 10 September is signed out around 10 October whether or not they opened the app daily in between.
- **For most of the roster there is no way back.** No e-mail means "Zaboravljena lozinka" has nowhere to send a link; no password means the login form cannot help either. The only recovery is texting the voditelj, which turns one person's phone into a helpdesk for seventy-five people.
- **A second phone is the same dead end.** A dancer who buys a new phone, or wants the app on a tablet, has no credential to type anywhere.
- **`Members.email` was never a contact field.** Its `admin.description` says so outright: *"Where the app invitation is sent."* That is its only job in the entire repository, and it serves one person. Meanwhile `invite.ts` carries a rule — **"The Member's email wins"** — that moves a login onto the Member's address on every invitation press, precisely so that one person cannot end up with two addresses.

That last pair is the collision. The moment a dancer types their own address anywhere, "the Member's e-mail wins" becomes a rule that silently overwrites it with a field the voditelj maintains on the dancer's behalf.

The question this ADR answers is therefore not "should a moreškant be a user" — they have held a `Users` row with the `moreskant` permission since the first invitation. It is **who holds the key**.

## Decision

**The dancer holds it.** Concretely:

1. **The session slides.** A request under `/app` whose session cookie is older than seven days is re-issued for another thirty. A dancer who opens the app at all never falls out; only a dancer who has been away a month does, and that person needs a fresh way in anyway.
2. **`Users.email` is the truth, and `Members.email` is retired**, along with the "Member wins" rule that existed only to resolve a conflict that no longer occurs. A dancer writes their own address, on their own row, through a route that checks the Member belongs to them. The voditelj keeps `Members.mobile`, because **the mobile is the voditelj's channel and the e-mail is the dancer's access** — that is the line, and it is a clean one.
3. **Every moreškant is asked to set an e-mail and a password, together, as one task.** Not a blocking step: a card on Početna that removes itself when the task is done, plus the fields on Profil, plus one push.
4. **Nothing is taken away from anyone who declines.** "Kopiraj pozivnicu" stays forever. Roughly half the roster will never type an address and that is not a defect being worked off — it is a fact about seventy people from Korčula. A voditelj-minted link remains a first-class way in, permanently.

## Consequences

- A dancer's address is now PII inside `/app` in a way ADR-0024 avoided. The narrowing that keeps that honest: it is the reader's **own** address on their **own** Profil, and it appears on no other dancer-facing surface. The season profile still shows neither mobile nor e-mail for anybody, the reader included, and the Članovi list still projects the e-mail away before the row reaches a client component.
- `Users.email` on a dancer is written by the dancer, so a voditelj can no longer fix a typo in it. That is the trade: the address is only useful as a recovery channel if the person who owns the inbox is the person who typed it.
- The "one task" framing means a dancer who sets only a password reads as incomplete on the roster even though they can now sign in on any phone. Deliberate: the roster mark says the TASK is done, and half of it is not done. The reverse does **not** hold, and reading the address alone was the bug the #653 review found: a dancer who typed an address and skipped the password read as complete while still carrying the random password their invitation minted, so the mark was empty about nobody and full about exactly the person it exists to catch. "Has a password" is therefore recorded rather than inferred (`users.password_set_at`), because every invited account already has a hash.
- **The card's audience is the invitation's audience** (#664). "Every moreškant is asked" was written in this ADR and never in the code: `ownAccessPrompt` guarded on the two credentials and on `shared`, so it also asked the account holding all eleven permissions to set a password it had had since May. The test is `isDancerLogin` (`src/lib/access/permissions.ts`), the same predicate that decides where an invitation may land, because it is the same population — "links a Member" is not the test, since #462 links a voditelj's own Member to their staff login.
- **`users.password_set_at` NULL is "unknown", never "no"** (#664). The column is younger than every account it describes, so a row that predates it says nothing about the person. For a dancer that unknown is honest and the card asks anyway, which costs a minute; for everybody else the audience rule above is what makes it harmless, and the historical staff and partner rows were stamped once from `created_at`. The distinction is named in code as `readPasswordStamp`.
- **"Pošalji pozivnice svima" is retired by this decision**, not by a passing tidy-up. It mailed every active moreškant who had a `Members.email` and no login; once the address is the LOGIN's, a dancer with no login has no address anywhere, so the action could only ever report that it had nobody to write to. What remains is the per-dancer pair on the profile — the SMS link, which needs no address, and the letter, for a dancer who has set one.
