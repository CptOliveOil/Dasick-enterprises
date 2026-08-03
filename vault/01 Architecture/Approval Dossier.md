---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The registry that renders any approval as summary, panels and actions
related:
  - [[Approval System]]
  - [[Studio Review]]
  - [[Every Approval Must Show The Work]]
tags:
  - architecture
---

# Approval Dossier

> [!info] Purpose
> Panels are presentation shapes, not businesses: document, claims, sources, scores, scenes, versions, media, ledger, items, fields. A new business inherits the whole review screen by existing.

**Code** — `lib/approvals/dossier/*`

## Responsibilities

- Register a builder per approval kind
- Fall back to a generic builder that resolves whatever the payload points at
- Assemble summary metrics, provenance and consequences

## Inputs

- An approval row

## Outputs

- A `Dossier`: approval meta, summary, panels, actions, document, source

## Dependencies

- [[Approval System]]
- [[Copyright Review]] for the studio dossier

## Failure modes

- **A kind with no builder** → the generic builder still produces a complete review. A specific builder makes a review better, never possible.

## Future improvements

- Side-by-side comparison of two approvals
- Operator-defined panel ordering

## Related

- [[Approval System]]
- [[Studio Review]]
- [[Every Approval Must Show The Work]]
