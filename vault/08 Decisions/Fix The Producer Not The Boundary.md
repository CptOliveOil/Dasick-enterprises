---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Repair where bad data originates
adr: 7
decided: 2026-07
related:
  - [[Blank UUID In Research]]
  - [[Database]]
tags:
  - decision
  - adr
---

# ADR-007 — Fix The Producer Not The Boundary

> [!success] Decision
> When invalid data reaches the database, the fix goes in the producer. The boundary gets a guard as well, not instead.

**Status** — accepted

## Reason

Patching the schema to accept an empty string would have hidden six further instances that the boundary guard then surfaced.

## Alternatives considered

- **Relaxing the column** — explicitly rejected by the operator and correct.
- **Only guarding the boundary** — insufficient; the producer keeps producing.

## Trade-offs

Two changes instead of one, and the guard can surface latent problems all at once.

## Consequences

`assertStorableRow()` runs on both stores. `optionalId()` and `requireId()` make the intent explicit at every call site.

## Related

- [[Blank UUID In Research]]
- [[Database]]
