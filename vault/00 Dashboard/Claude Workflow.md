---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: How Claude Code uses this vault
related:
  - [[Daily Workflow]]
  - [[Vault Conventions]]
tags:
  - meta
  - dashboard
---

# Claude Workflow

> [!important] The contract
> This vault is the project's long-term memory. **Documentation must never drift
> from the implementation.** A change that alters behaviour and leaves this vault
> untouched is an incomplete change.

## Standing instructions

These live in `CLAUDE.md` at the repository root so they apply automatically.

| Trigger | Required update |
| --- | --- |
| Fixing a bug | Create or update a page in `07 Bugs/`. Record root cause, investigation, fix, test, commit and **lesson**. |
| Adding or changing a provider | Update its page in `04 Providers/`, including env vars, costs and failure modes. |
| Changing architecture | Update the page in `01 Architecture/` — responsibilities, failure modes, dependencies. |
| Changing a workflow | Update `06 Workflows/`, including the Mermaid diagram. |
| A choice hard to reverse | Create an ADR in `08 Decisions/`. |
| Adding a table or migration | A page in `05 Database/` and a row in [[Migrations]]. |
| Completing a milestone | Update [[Current Phase]] and [[Roadmap]]. |
| Adding an endpoint | A page in `11 APIs/`. |

## Reading it

Ask Claude Code to read the relevant pages before implementing. The vault carries
the constraints that are not obvious from the code — why budgets have no default,
why analytics returns nothing in a demo, why provenance is a lookup.

## Honesty rules for this vault

1. **Never document something as built when it is not.** Use `status: planned`.
2. **Never delete a bug page.** The pattern outlives the fix.
3. **Never soften a lesson.** "Fix the producer, not the boundary" is worth more
   than "added validation".
4. **Record what was rejected**, not only what was chosen.
5. **Bump `updated`** on every substantive edit.
