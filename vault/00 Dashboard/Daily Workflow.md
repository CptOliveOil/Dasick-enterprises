---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Obsidian and Claude Code together
related:
  - [[Vault Conventions]]
  - [[Maintenance]]
  - [[Home]]
tags:
  - meta
  - dashboard
---

# Daily Workflow

## Morning

1. Open [[Home]]. Read [[Blockers]] and [[Current Phase]].
2. Check the Dataview block on [[Home]] for anything `draft`, `needs-review` or `stale`.
3. Pick one thing.

## Working

Open the relevant page **before** asking Claude Code to change anything. The page
is the brief.

> Read `vault/01 Architecture/Rendering Pipeline.md` and
> `vault/07 Bugs/Zoompan Frame Explosion.md`, then implement scene replacement.

Claude Code has standing instructions in `CLAUDE.md` to update this vault as part
of the same change. See [[Claude Workflow]].

## Before a real run

1. `npx vitest run` — green
2. Settings → Status shows the mode you expect
3. AI budget is set
4. Start **short**. A 2-minute script proves the pipeline for a fraction of the cost.

## After anything meaningful

| What happened | Update |
| --- | --- |
| A bug | A page in [[07 Bugs/Index\|Bugs]] — **never** delete one |
| An architectural choice | A page in [[08 Decisions/Index\|Decisions]] |
| A system changed | Its [[Index of Systems\|architecture page]] |
| A provider connected | Its [[04 Providers/Index\|provider page]] |
| A table added | A page in [[05 Database/Index\|Tables]] + [[Migrations]] |
| A milestone | [[Current Phase]] and [[Roadmap]] |

## Weekly

- Reconcile [[Blockers]] against reality
- Move anything from [[Ideas]] that has earned a reason into [[Backlog]]
- Run the graph view; fix orphans
- See [[Maintenance]]
