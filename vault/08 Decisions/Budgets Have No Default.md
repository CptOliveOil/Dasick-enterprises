---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Nothing spends until the operator sets a figure
adr: 4
decided: 2026-07
related:
  - [[Budget System]]
  - [[ai_budgets]]
  - [[Authority Model]]
tags:
  - decision
  - adr
---

# ADR-004 — Budgets Have No Default

> [!success] Decision
> There is no default budget. Until the operator activates one, nothing runs.

**Status** — accepted

## Reason

A limit you did not choose is not a limit. Inheriting a demo figure into a real workspace would be a number nobody agreed to.

## Alternatives considered

- **Inheriting the £250 demo budget** — explicitly rejected by the operator and correct.
- **A conservative default like £10** — rejected; still a number nobody chose.

## Trade-offs

A new real workspace does nothing until Settings → AI budget is completed. That friction is deliberate.

## Consequences

Estimates round **up** — an unknown model is priced as the dearest, because guessing low is how a ceiling gets passed. No agent can raise a ceiling: `ai_budgets` is owner-only at the database level.

## Related

- [[Budget System]]
- [[ai_budgets]]
- [[Authority Model]]
