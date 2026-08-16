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
  - [[workflow_definitions]]
  - [[workflow_runs]]
tags:
  - architecture
---

# Workflow Engine

> [!info] Purpose
> A workflow is a list of steps: a key, a capability, its dependencies and whether it needs an approval. Built-in definitions live in code, not in the database — a genuinely custom one is a database row, owned by the operator who created it.

**Code** — `lib/workflows/definitions.ts`, `resolveWorkflow()` in `lib/workflows/engine.ts`

## Responsibilities

- Hold the built-in workflow definitions
- Resolve a `workflowKey` to a definition — code first (`findWorkflow`), then
  the operator's own rows in `workflow_definitions` (`resolveWorkflow`, added
  alongside the [[workflow_runs]] fix, since `findWorkflow` alone never
  reached a database-defined workflow at all)
- Assign stable, unique step keys (see [[Step Key Collision]])

## Inputs

- A workflow key, or a plan from the [[Manager]]

## Outputs

- An ordered list of planned steps with dependency indices
- A [[workflow_runs]] row identifying which workflow ran — by `workflow_key`
  for a built-in, by a real `workflow_definition_id` for a custom one, never
  a code-only id pretending to be a database row

## Dependencies

- [[Mission Engine]] consumes them
- [[Capability Registry]] must provide every named capability
- [[workflow_definitions]] for a custom workflow

## Failure modes

- **A definition names a capability with no handler** → caught by `tests/modes.test.ts`.
- **A workflow names a provider** → forbidden; asserted by test. Vendors belong in [[Provider Layer]].
- **A built-in workflow's code-only id written as a database foreign key** →
  fixed; see
  [[Workflow Runs Referenced A Workflow That Was Never A Database Row]].
  `MemoryStore` never enforces foreign keys, so this passed 524 tests before
  it ever reached a real, constrained database.

## Future improvements

- An actual authoring UI for operator-created workflows — `resolveWorkflow`
  can now run one that exists as a row, but nothing yet writes that row from
  the product
- Branching steps (currently linear dependencies only)

## Related

- [[Mission Engine]]
- [[Capability Registry]]
- [[Mode System]]
- [[06 Workflows/Index|Workflows]]
- [[workflow_definitions]]
- [[workflow_runs]]
