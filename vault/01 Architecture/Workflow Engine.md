---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The library of step definitions that missions are built from
related:
  - [[Mission Engine]]
  - [[Capability Registry]]
  - [[Mode System]]
  - [[06 Workflows/Index|Workflows]]
tags:
  - architecture
---

# Workflow Engine

> [!info] Purpose
> A workflow is a list of steps: a key, a capability, its dependencies and whether it needs an approval. Definitions live in code, not in the database.

**Code** — `lib/workflows/definitions.ts`

## Responsibilities

- Hold the built-in workflow definitions
- Resolve a `workflowKey` to a definition
- Assign stable, unique step keys (see [[Step Key Collision]])

## Inputs

- A workflow key, or a plan from the [[Manager]]

## Outputs

- An ordered list of planned steps with dependency indices

## Dependencies

- [[Mission Engine]] consumes them
- [[Capability Registry]] must provide every named capability

## Failure modes

- **A definition names a capability with no handler** → caught by `tests/modes.test.ts`.
- **A workflow names a provider** → forbidden; asserted by test. Vendors belong in [[Provider Layer]].

## Future improvements

- Operator-authored workflows stored per business
- Branching steps (currently linear dependencies only)

## Related

- [[Mission Engine]]
- [[Capability Registry]]
- [[Mode System]]
- [[06 Workflows/Index|Workflows]]
