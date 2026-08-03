---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Turns an instruction into a mission with a dependency-ordered task graph
related:
  - [[Workflow Engine]]
  - [[Task Graph]]
  - [[Agent Engine]]
  - [[Retry Engine]]
  - [[Manager]]
tags:
  - architecture
---

# Mission Engine

> [!info] Purpose
> A mission is the unit of work an operator asks for. The engine creates it, plans its steps, and decides which step may run next — nothing else in the system is allowed to decide that.

**Code** — `lib/workflows/engine.ts`, `lib/workflows/runner.ts`

## Responsibilities

- Create a mission from a workflow definition or an AI-generated plan
- Assign each step to an agent that provides the required capability
- Build the dependency edges between steps
- Release `waiting` steps once their dependencies complete
- Cancel dependents when an upstream step fails
- Recompute mission status and progress after every step

## Inputs

- An instruction (via [[Manager]]) or a `workflowKey`
- A business, which scopes agents, memory and records
- Optional seed input for the first step

## Outputs

- One `missions` row, one `tasks` row per step, `task_dependencies` edges
- A `workflow_runs` row when a definition was used
- Activity log entries

## Dependencies

- [[Workflow Engine]] for definitions
- [[Agent Engine]] to run a step
- [[Database]] for persistence

## Failure modes

- **No agent provides a capability** → the task is created with an error rather than silently skipped, so the gap is visible.
- **Derived step keys collide** → fixed; see [[Step Key Collision]].
- **A step ends without changing status** → the runner would loop; bounded by `maxSteps`.

## Future improvements

- Parallel execution of independent branches (currently one step per pass)
- Mission templates with operator-supplied variables

## Related

- [[Workflow Engine]]
- [[Task Graph]]
- [[Agent Engine]]
- [[Retry Engine]]
- [[Manager]]
