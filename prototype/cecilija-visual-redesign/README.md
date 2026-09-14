# Cecilija visual redesign prototype (throwaway)

The sources of the phone prototype that settled the Cecilija redesign (map issue #560, tickets #561 to #574, built as PRs #575 to #590 in September 2026). This branch is a primary source, never merged into `main`; `main` keeps only the validated decisions (the design system in `src/app/app/ui/`, the tokens in `src/app/app/app.css`, the glossary changes in `CONTEXT.md`, the plan paragraph in `docs/agents/moreskant-app.md`).

## The question it answered

"What should the app look like so a dancer wants to open it every day, and which four IA changes go with the new skin?" Direction B ("Podij") won on the direction board, with the changes listed under Q61 of the plan: the greeting from A, the hero on a white card, the army state instead of a bare count, the tickets ring on Statistika, the podium on Ljestvica, the name and role on top of Moreška, "Vanredna" for non-public evenings.

## Files

- `gen.py`, `gen2.py`: build the artboards (round 1 and round 2 of the phone prototype) from the token tables; `patch_dark.py`, `patch_final.py`: the dark-skin and last-round patches; `build.py`: the seed step.
- `cecilija-prototip.template.html`, `cecilija-prototip.html`: the prototype page (Claude Design canvas payload, seeded).
- `canvas.json`: artboard layout; `logo.png`: the wordmark asset.
- `plan-redizajna.html`: the plan page with the decisions Q1 to Q67 (the decision record, published as https://claude.ai/code/artifact/b63a989f-e765-4b02-bb43-2be86bca735c).
- `tickets.py`: generated the fourteen GitHub tickets from the plan.
- `skill-redizajn.html`: the write-up of the method that became `~/.claude/skills/redesign-app/`.

## Decision record

Plan: https://claude.ai/code/artifact/b63a989f-e765-4b02-bb43-2be86bca735c
Prototype: https://claude.ai/code/artifact/ecd3f32d-b14e-460a-b6be-421874d4cf03
Direction board: https://claude.ai/code/artifact/60074106-c946-4103-85d2-6774ec80d3dd
Audit: https://claude.ai/code/artifact/db933451-9b3d-45c3-8ada-71194325b296
