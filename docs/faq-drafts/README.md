# FAQ drafts — review before publishing

Review-ready English answers to the **50 tourist questions** supplied by an HGD tourist-guide member (a guide who also runs the Moreška Experience, so the list reflects real visitor curiosity). Same discipline as `docs/blog-drafts/`: **drafts for human editorial review, grounded in source docs, no invented facts, NOT auto-published.**

- **Strategy & rationale:** `docs/geo-strategy.md`.
- **Answers:** `faq-answers-en.md` (this folder).
- **Language:** English first (the only crawler/LLM-visible surface). HR is a fast-follow after EN sign-off.
- **Sources:** `docs/sveta-cecilija.md` (history), `docs/copywriting.md` (show facts, voice), `docs/marketing.md` §3 (experience findings). Line citations are in each answer.

## How these get published (Phase 1, after fact sign-off)

1. You/HGD verify the facts — especially the ⚠️ flagged items below.
2. I build the `faqs` Payload collection + `/faq` route + `FAQPage` JSON-LD + entity-schema enrichment + `llms.txt` (`geo-strategy.md` §7).
3. Verified answers are seeded as Payload **drafts**; HGD publishes. Top Q&A are also reused inline on `/tickets`, `/about`, and the matching blog posts.

## Triage — all 50 questions

**Routing:** `FAQ` = short answer lives in the FAQ. `→Blog` = also feeds / links to a blog post (`docs/blog-drafts/`). **Dupes** are answered once and cross-referenced.

| # | Question (EN) | Category | Routing | ⚠️ Verify |
|---|---|---|---|---|
| 1 | What is the Moreška? | About | FAQ →Blog 2 | |
| 2 | Where is the Moreška performed? | Visiting | FAQ | |
| 3 | Who performs the Moreška? | Dancers | FAQ →Blog 6 | |
| 4 | Is the Moreška dynamic? *(= Q22)* | The dance | FAQ | |
| 5 | Is the Moreška worth seeing? | About | FAQ | |
| 6 | Is the Moreška protected? | About | FAQ | |
| 7 | Are the swords in the Moreška real? | Swords | FAQ →Blog 1 | |
| 8 | Why do the kings fight in the Moreška? | Story | FAQ | |
| 9 | Who is the Bula? | Story | FAQ | king naming |
| 10 | Why is the Bula important? | Story | FAQ | |
| 11 | Who is the Bula's fiancé? | Story | FAQ | king naming |
| 12 | Who is Moro? | Story | FAQ | king naming |
| 13 | Who is Otmanović? | Story | FAQ | king naming |
| 14 | Who is Osman? | Story | FAQ | king naming |
| 15 | How long is a Moreška performance? | Visiting | FAQ →Blog 1 | ⚠️ runtime |
| 16 | Is the Moreška a dance or a play? | About | FAQ | |
| 17 | Is there spoken/dramatic text? | About | FAQ | |
| 18 | Why is the Bula in chains? | Story | FAQ | |
| 19 | What is the *sfida*? | The dance | FAQ | |
| 20 | How many dance figures does it have? | The dance | FAQ | |
| 21 | What colours are the opposing armies? | The dance | FAQ | king naming |
| 22 | Is the Moreška dynamic? *(dup of Q4)* | — | see Q4 | |
| 23 | How much practice to dance ("batit") it? *(≈Q33,Q45)* | Dancers | FAQ →Blog 6 | ⚠️ no figure in source |
| 24 | How heavy are the swords? | Swords | FAQ →Blog 1 | |
| 25 | When was the Moreška first mentioned in Korčula? | History | FAQ →Blog 2 | |
| 26 | When is the most ceremonial performance? | History | FAQ | |
| 27 | Is it performed with musical accompaniment? | Music | FAQ | |
| 28 | Who wrote the music? | Music | FAQ →Blog 2 | |
| 29 | How many moreškanti take part? *(≈Q50)* | Dancers | FAQ | ⚠️ cast size |
| 30 | Why did the Moreška survive only in Korčula? | History | FAQ →Blog 2 | |
| 31 | Does it have main characters? | Story | FAQ | king naming |
| 32 | How do young people learn the Moreška? | Dancers | FAQ →Blog 6 | |
| 33 | Is practice needed to perform it? *(≈Q23)* | Dancers | see Q23 | |
| 34 | Where are performances held? *(≈Q2)* | Visiting | see Q2 | |
| 35 | Do you buy tickets for the Moreška? | Visiting | FAQ | |
| 36 | Where is it held if it rains? | Visiting | FAQ | |
| 37 | What language is the Moreška performed in? | Music | FAQ | ⚠️ narration language |
| 38 | Are the moreškanti professional dancers? | Dancers | FAQ →Blog 6 | |
| 39 | Is the accompanying music performed live? | Music | FAQ | |
| 40 | Is the Moreška performed only in summer? | Visiting | FAQ | |
| 41 | Can you meet the moreškanti after the show? | Visiting | FAQ | ⚠️ HGD policy |
| 42 | Can you take photos with the moreškanti after? | Visiting | FAQ | ⚠️ HGD policy |
| 43 | Which king wins in the end? | Story | FAQ | king naming |
| 44 | Do children also perform the Moreška? | Dancers | FAQ | ⚠️ kids in public show |
| 45 | How much practice does it demand? *(≈Q23)* | Dancers | see Q23 | |
| 46 | Is the Moreška a symbol of Korčula? | About | FAQ | |
| 47 | Do dancers ever get injured performing it? | Swords | FAQ | ⚠️ injury framing |
| 48 | Is the Moreška dangerous? | Swords | FAQ | ⚠️ injury framing |
| 49 | Which countries has HGD Sveta Cecilija toured with the Moreška? | History | FAQ →**Blog 7?** | ⚠️ tour list |
| 50 | How many people take part in a performance? *(≈Q29)* | Dancers | see Q29 | ⚠️ cast size |

**Net:** 50 questions → ~44 unique answers (6 are near-duplicates, consolidated). "king naming" is a single shared flag (blog README item 1).

## Verification flags — status (HGD answered 2026-07; 8 of 9 resolved)

1. ✅ **King naming** — CONFIRMED: Osman = White King (wears **red**), Moro = Black King / abductor (wears **black**), Otmanović = Moro's father (*not* a king). White (red) army wins. Applied to Q8–Q14, Q18, Q21, Q31, Q43.
2. ✅ **Show runtime (Q15)** — CONFIRMED: the whole evening (incl. other sections) runs **~1 hour / ~60 min**. Historic St. Theodore presentation up to two hours; dance portion up to ~30 min.
3. ✅ **Practice/training figure (Q23/33/45)** — CONFIRMED: **~10 months to 1.5 years** to become stage-ready. Corrected the earlier "years / from childhood" framing.
4. ✅ **Cast size (Q29/50)** — CONFIRMED: **6–12 pairs of dancers per side** (up to **15/side** for the grandest shows; kings + Otmanović counted within the pairs), + Bula + torchbearers + **orchestra ~20** + **klapa 5–8**. Exact grand total not given. Society membership corrected to ~150 (was ~80), per HGD 2026-07.
5. ✅ **Narration language (Q37)** — CONFIRMED: spoken intro/summary for visitors given in **Croatian and English** (dialogue itself in archaic Korčulan dialect).
6. ✅ **Children in public shows (Q44)** — CONFIRMED: the **most-prepared young dancers perform when ready / when needed**.
7. ✅ **Injury / danger framing (Q47/48)** — CONFIRMED: current framing approved; injuries **can happen and are accepted as part of the performance**, kept rare by training.
8. ✅ **Meet & photos after the show (Q41/42)** — CONFIRMED: visitors **can be photographed with the two kings and the Bula**, and are welcome to **join the society for a drink at its premises**.
9. ⚠️ **Tour countries (Q49)** — STILL PENDING → tracked in **issue #340**. Only Prague 1947 confirmed; a guide's Spain/France/Albania/Italy list is unconfirmed. Keep Q49 hedged and hold the candidate **7th blog post** ("Moreška around the world") until #340 returns a verified list.
10. ⚠️ **Odak music dates (Q28)** flagged: composed **1937**, in use since **1947**; per HGD note one digit may be swapped, to confirm.

**Copy pass 2026-07-14:** section B reordered (main-characters overview now first); society ~80 to ~150; AI em-dash removed from all answers per new copy rule.
