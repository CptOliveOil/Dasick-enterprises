---
status: stable
created: 2026-08-03
updated: 2026-08-16
owner: fayaz
summary: Turns an instruction into a mission with a dependency-ordered task graph
related:
  - [[Workflow Engine]]
  - [[Task Graph]]
  - [[Agent Engine]]
  - [[Retry Engine]]
  - [[Manager]]
  - [[Capability Scope]]
  - [[Operational Readiness]]
  - [[A Missing Agent Left A Readiness Task Queued Forever]]
tags:
  - architecture
---

# Mission Engine

> [!info] Purpose
> A mission is the unit of work an operator asks for. The engine creates it, plans its steps, and decides which step may run next — nothing else in the system is allowed to decide that.

**Code** — `lib/workflows/engine.ts`, `lib/workflows/runner.ts`, `lib/workflows/readiness.ts`

## Responsibilities

- Create a mission from a workflow definition or an AI-generated plan
- Refuse to create a mission that plans a [[Capability Scope|business-scoped]]
  step with no business — `ScopeViolation`, before a row is written
- Assign each step to an agent that provides the required capability
- Build the dependency edges between steps
- Release `waiting` steps once their dependencies complete
- Cancel dependents when an upstream step fails
- Recompute mission status and progress after every step — and, for a mission
  with no tasks of its own but children (`parent_mission_id`), derive its
  status from those children instead (`deriveParentMissionState`)

## Inputs

- An instruction (via [[Manager]]) or a `workflowKey`
- A business, which scopes agents, memory and records — `null` for a
  system-level mission, which then either has no business-scoped steps at all
  or is itself a pure orchestrator (`allowNoSteps: true`) waiting on children
- Optional seed input for the first step
- Optionally, a `parentMissionId` — set only when this mission is one
  business' (or shared infrastructure's) share of a system mission; see
  [[Operational Readiness]]

## Outputs

- One `missions` row, one `tasks` row per step, `task_dependencies` edges
- A `workflow_runs` row when a definition was used
- Activity log entries
- For a mission with children: propagated status up to its parent, and —
  once every child is terminal — a readiness report, via a dynamic import into
  `lib/workflows/readiness.ts` (the same layering-safe pattern
  `lib/workflows/approvals.ts` uses to reach `lib/islamic/resolve.ts`)

## Dependencies

- [[Workflow Engine]] for definitions
- [[Agent Engine]] to run a step
- [[Database]] for persistence
- [[Capability Scope]] for the business-required check

## Failure modes

- **No agent provides a capability** → the task is created with a pre-filled
  `error` naming the gap and `agent_id: null`, rather than silently skipped.
  This alone used to leave it `queued` forever and invisible — see
  [[A Missing Agent Left A Readiness Task Queued Forever]] — `getRunnableTasks`
  now includes it so `runAgent` can fail it cleanly, and
  `resolveAgentForCapability` backfills a missing *global* agent
  (provisioning drift — see the same page) before accepting "no agent" as
  final.
- **Derived step keys collide** → fixed; see [[Step Key Collision]].
- **A step ends without changing status** → the runner would loop; bounded by `maxSteps`.
- **A system mission needs business-scoped work** → fixed; see
  [[Operational Readiness Fans Out Instead Of Guessing A Business]]. Never
  solved by attaching a business to the system mission — solved by fanning
  out into one child mission per business.
- **A mission with nothing running but something queued read as `running`** →
  indistinguishable from genuine progress. Fixed; see
  [[A Missing Agent Left A Readiness Task Queued Forever]].

## Future improvements

- Parallel execution of independent branches (currently one step per pass)
- Mission templates with operator-supplied variables
- A hierarchy deeper than one level (nothing needs it yet, but
  `recomputeMission`'s propagation is already recursive)

## Related

- [[Workflow Engine]]
- [[Task Graph]]
- [[Agent Engine]]
- [[Retry Engine]]
- [[Manager]]
- [[Capability Scope]]
- [[Operational Readiness]]
