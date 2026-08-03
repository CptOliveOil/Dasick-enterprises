---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every capability runs through a single execution path
adr: 1
decided: 2026-07
related:
  - [[Agent Engine]]
  - [[Capability Registry]]
tags:
  - decision
  - adr
---

# ADR-001 — One Engine Not Two

> [!success] Decision
> All work — AI steps and provider steps alike — runs through `lib/agents/engine.ts`. There is no second path.

**Status** — accepted

## Reason

Authority, budget, prompting, validation, persistence, cost recording, activity
logging and approvals all have to happen for every step. A second path means
every one of those is implemented twice and drifts.

## Alternatives considered

- **A separate media pipeline** — rejected; media steps need budgets and approvals just as much.
- **A plugin system per capability** — rejected as premature.

## Trade-offs

The engine is a large function and a hot path. Every change to it touches everything.

## Consequences

A new capability inherits governance for free. A new agent type needs no engine change.

## Related

- [[Agent Engine]]
- [[Capability Registry]]
