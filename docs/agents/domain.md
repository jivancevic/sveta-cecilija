# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary. This repo is **single-context**, so there is no `CONTEXT-MAP.md`.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

## File structure

Single context:

```
/
├── CONTEXT.md                         ← domain glossary
├── docs/adr/                          ← architecture decisions
└── src/
```

(If the repo ever grows multiple bounded contexts, `/grill-with-docs` introduces a `CONTEXT-MAP.md` at the root pointing at one `CONTEXT.md` per context.)

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 — but worth reopening because…_
