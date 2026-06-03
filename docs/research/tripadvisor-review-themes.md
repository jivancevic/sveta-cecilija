# TripAdvisor review themes — Moreška Sword Dancing

> Voice-of-customer analysis for issue #124. Mines the public TripAdvisor listing
> [Moreska Sword Dancing, d1898279](https://www.tripadvisor.com/Attraction_Review-g1007309-d1898279-Reviews-Moreska_Sword_Dancing-Korcula_Town_Korcula_Island_Dubrovnik_Neretva_County_Dalma.html)
> for recurring, fixable complaints behind the 0.7-star gap from a perfect score.

## Method & scope

- **Source:** TripAdvisor listing d1898279, the official claimed page (see #35).
- **Collection:** one-time paginated read of the public review pages (offsets 0–160), June 2026. No recurring scraper was stood up, per the acceptance criterion and TripAdvisor ToS. This was a single internal pull of public content.
- **Coverage:** 161 reviews in the default (mostly English) view; TripAdvisor's headline count is ~200 across all languages, so a minority of non-English reviews were not pulled in this pass. Date range: **August 2011 → September 2025** (~14 years).
- **Overall rating shown:** 4.3 / 5.
- **Coding:** each review was bucketed by theme, tagged for sentiment, and noted for recency. Counts below are approximate frequencies from the 161-review sample, not exact tallies, because the page text was read through a summarizing fetch rather than field-by-field export. Treat the *ranking* of themes as solid and the *absolute counts* as indicative.

The rating skew matches the 4.3 average: the large majority are 4–5★. The actionable signal lives almost entirely in the ~25 reviews at 1–3★ plus the caveats embedded inside otherwise-positive reviews. Those are what this report ranks.

## What already works (do not touch)

These are praised over and over and are the core of the product. Any change to pacing or staging must protect them.

- **The live sword combat.** Real swords, audible clashing, visible sparks, occasional real blood. This is *the* moment, named admiringly in dozens of reviews ("sparks flying," "a little dangerous," "blood was actually spilt"). It is the single biggest driver of 5★ reviews.
- **Authenticity / living tradition.** "Only place in the world," generational, performed by local volunteers, centuries old. Visitors value that it is real, not a tourist re-enactment troupe.
- **Costumes and the medieval old-town setting at night.**
- **Roughly one-hour runtime** is "just right" for most who liked it.

## Ranked improvement themes

### 1. Pacing: the show "drags," is "repetitive," and starts slowly  — TOP issue
By far the most frequent complaint, and the one most correlated with low ratings. It has two distinct sub-causes that reviewers name separately:

- **The combat choreography feels repetitive** once the novelty wears off: "repeated the same dance for 45 minutes" (1★), "very repetitive ... what a waste of money" (2★), "it's just more of the same" (2★), "a bit long and repetetive, a 30-minute version would be ideal" (3★), "Slow to start then very much the same" (2★), and milder versions inside 4★ reviews ("gets a bit repetitive after a while").
- **The opening (the a cappella / klapa singing and the long intro) is where people disengage:** "boring and completely unnecessary" singing (3★), "long winded ... excessive preliminary music" (3★), "long waiting boring singing" (1★). Several note audience members falling asleep before the dance starts.

Note the polarity: the same opening singing is called "divine" by others. It is genuinely polarizing, not uniformly bad. The safe lever is **tightening the front of the show and setting expectations**, not removing the tradition.

### 2. "I couldn't follow the story" / narration problems
Recurring across all rating bands. The multilingual spoken intro is simultaneously too long *and* leaves non-speakers lost:
- "lengthy descriptions in 6 languages" (5★), "lengthy multilingual announcements" (2★), "unintelligible dialogue" (3★), "would have benefited from english commentary" (4★), wished they had "known exactly what was going on" (5★).
- Where a crib sheet / booklet was used, reviewers loved it and understood the show. But: "no one offered or mentioned these" and "not even a panflet is given." The aid exists but is not reliably distributed.

### 3. Seating, visibility, and "arrive early"
The most-repeated *piece of advice* in the entire dataset is "buy ahead and arrive early for a good seat" (a dozen-plus reviews). That is a signal that **seating/visibility is a real constraint that is not communicated at the point of sale.** Related: "small performance arena," and front-row visibility tradeoffs (see #4). People who arrived late or sat badly rate lower.

### 4. Front-row safety is a surprise, not a warning
Many reviews warn *each other* about the front row: flying "fragments from the swords," dropped swords, real blood, children frightened. Today this lands as word-of-mouth folklore. It should be a clear, upfront notice (it can even be framed as part of the thrill).

### 5. Value / "overpriced" — almost always tied to perceived length/repetition
"Overpriced" rarely appears alone; it co-occurs with "repetitive" or "too long" (€20 / 100kn called overpriced by 3★ reviewers, "save your money," "a bit overrated"). Fixing perceived pacing and setting duration expectations defuses most of the price complaints. Two also asked specifically for **family ticket pricing** (note: child tickets are already €10 — this is a *discoverability* gap, not a pricing one, and pricing is fixed per project rules).

### 6. Venue is hard to find
"Not one sign to tell you where it is held, pretty hard to find," "confusion locating the venue due to vague directions," "hard to find." A pure wayfinding/comms fix.

### 7. Noise from neighbouring bars/restaurants
"Pop music from a nearby restaurant interferes," "the karaoke bar just outside intruded on the performance." Lower frequency but a real atmosphere-killer for an open-air evening show.

### 8. "Touristy / lacks passion / inauthentic" (a minority, but worth noting)
A handful felt it was "put on for tourists," "robotic," "hokey," or lamented the move from free performances inside the city walls to a paid stage outside. This partly contradicts the dominant "authentic" praise, so it is a perception issue for a subset, not a systemic one.

## HGD-controllable vs not

| Theme | Controllable? | Lever |
|---|---|---|
| Slow/repetitive **opening** (#1) | **Yes** | Tighten the intro; set expectations on the 3-part structure |
| Repetitive **combat** (#1) | Partly (it's tradition) | Manage expectations; resist over-trimming the loved core |
| Narration / story comprehension (#2) | **Yes** | Surtitles, QR/printed program, reliably hand out the aid |
| Seating / arrive-early (#3) | **Yes** | Communicate at booking + confirmation |
| Front-row safety surprise (#4) | **Yes** | Notice at booking + on-site signage |
| Value perception (#5) | **Yes (indirect)** | Expectation-setting; surface €10 child price |
| Venue hard to find (#6) | **Yes** | Map/directions in confirmation email + signage |
| Neighbour noise (#7) | Partly | Coordinate timing with adjacent venues |
| "Touristy" perception (#8) | Partly | Lean into the authenticity story in comms |
| Heat / open-air discomfort | Mostly not | Minor: water, timing |
| Personal taste (sword dance / singing "not for me") | **No** | Inherent |

## Recommended actions (ranked)

Prioritised by frequency × controllability × cost. The first three are cheap, ship before peak season, and are mostly *communications* fixes the new moreska.eu site is already positioned to deliver.

1. **Set expectations at the point of sale and on the ticket page.** State the runtime (~1 hour), the 3-part structure (choir/orchestra → narration → sword combat), and "arrive early / doors open at X for best seating." This single change attacks themes #1, #3 and #5 at once: most "too long / overpriced / bad seat" reviews come from mismatched expectations, not from the show itself. The new `/tickets` and `/checkout/[showId]/confirmation` flows are the natural home for this.

2. **Fix story comprehension with a multilingual digital program.** Put the plot (the red king / black king / princess), a one-line per-act guide, and the history behind a QR code on the ticket/signage, in EN/HR (+ the other intro languages if cheap). This directly answers the very common "I couldn't follow what was happening" and "no panflet was given" complaints, and lets the spoken intro be *shortened* (helping theme #1) because the detail lives in the program. Reuse the existing scan/QR plumbing.

3. **Ship a clear "how to find us + what to expect" block in the confirmation email and a venue/directions section.** Map, walking directions from the old-town landmarks, start time, and a friendly front-row safety note ("the front rows are thrilling but sparks and fragments can fly — sit a few rows back with small children"). Closes themes #4 and #6 for near-zero cost.

4. **Tighten the opening, not the combat.** Operationally (HGD-side, not dev): trim the pre-dance singing/announcement segment or clearly bill it as a distinct opening act, so the energy doesn't sag before the swords. Protect the combat — it is the thing people love. Consider a brief, punchy multilingual intro now that the program (action 2) carries the detail.

5. **Surface that child tickets are €10** wherever "value" or "family" is a concern, so the family-pricing requests are answered by discoverability rather than a (disallowed) pricing change.

## Caveats / limitations

- Counts are indicative, not exact (summarizing fetch, not a field-level export). The theme *ranking* is robust because the top themes recur dozens of times across independent reviewers and years.
- English-default view (161 of ~200). A non-English pass could be folded in later, and Google Business Profile reviews (now claimed, #36) would make a good cross-source check on the same themes.
- Several recommendations are operational (show pacing, neighbour coordination) and sit with HGD/show ops, not the dev scope. They are included because the issue explicitly asked for the controllable-vs-not split and concrete actions regardless of owner.

## Cross-references

- Feeds the review-velocity push in `docs/marketing.md` §3 and the door-staff review cards (#43).
- The comms fixes (actions 1–3) are implementable against the existing `/tickets`, checkout/confirmation, and `/scan` surfaces.
