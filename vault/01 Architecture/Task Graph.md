---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Tasks, their dependencies, and the rules for what may run
related:
  - [[Mission Engine]]
  - [[Retry Engine]]
  - [[Mission Trace API]]
  - [[tasks]]
tags:
  - architecture
---

# Task Graph

> [!info] Purpose
> The graph is what makes retries surgical: each step is a row with its own status, input, output and error, so one can be re-run without touching the others.

**Code** — `lib/workflows/engine.ts`, `lib/agents/context.ts`

## Responsibilities

- One `tasks` row per step, keyed by `step_key`
- `task_dependencies` edges between them
- Status: `queued` → `running` → `completed` / `failed` / `cancelled` / `approval` / `waiting`

## Inputs

- Planned steps from the [[Workflow Engine]]

## Outputs

- Runnable task list; released tasks; cancelled dependents

## Dependencies

- [[Mission Engine]]
- [[Retry Engine]]

## Failure modes

- **Step keys collide** → outputs overwrite each other. Fixed; see [[Step Key Collision]].
- **`previousOutputs` read by a fixed key** → misses AI-planned missions. Fixed; see [[Script Not Found In AI Planned Missions]].

## Future improvements

- Visualise the graph in the UI (currently only via [[Mission Trace API]])

## Related

- [[Mission Engine]]
- [[Retry Engine]]
- [[Mission Trace API]]
- [[tasks]]
