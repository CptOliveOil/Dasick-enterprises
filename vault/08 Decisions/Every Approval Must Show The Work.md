---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: No decision from a summary
adr: 5
decided: 2026-07
related:
  - [[Approval System]]
  - [[Approval Dossier]]
  - [[Studio Review]]
tags:
  - decision
  - adr
---

# ADR-005 — Every Approval Must Show The Work

> [!success] Decision
> Every approval renders the actual work through a dossier registry. A kind with no builder still gets a complete review from the generic builder.

**Status** — accepted

## Reason

The bug that prompted this shipped "1 claim checked, 1 warning" above a button
that starts production and opens a budget. That is a receipt, not a review.

## Alternatives considered

- **A link to a detail page per kind** — rejected; the operator ends up approving without opening it.
- **A bespoke screen per kind** — rejected; it does not scale to hundreds of agent types.

## Trade-offs

The dossier layer is a real abstraction to maintain, and panels constrain what a builder can express.

## Consequences

A business added in a year inherits the whole review screen by existing. Panels are presentation shapes, not businesses.

## Related

- [[Approval System]]
- [[Approval Dossier]]
- [[Studio Review]]
