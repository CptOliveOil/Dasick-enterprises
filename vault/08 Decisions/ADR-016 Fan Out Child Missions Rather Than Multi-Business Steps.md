---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A system mission needing per-business work gets one child mission per business
adr: 16
decided: 2026-08
related:
  - [[Operational Readiness]]
  - [[Capability Scope]]
  - [[Mission Engine]]
tags:
  - decision
  - adr
---

# ADR-016 — Fan Out Child Missions Rather Than Multi-Business Steps

> [!success] Decision
> A system-level mission that needs business-scoped work done for every
> business gets one ordinary child mission per business, linked by a new
> `parent_mission_id`, instead of one mission whose steps loop over
> businesses internally.

**Status** — accepted

## Reason

A mission's tasks, cost, agents and RLS-scoped records are all keyed to
exactly one `business_id`. A single mission "helpfully" iterating over every
business inside one task's `run()` would need its own private notion of
per-business isolation, cost attribution and retry — reimplementing, badly,
what a mission already is. Reusing `createMission` per business instead means
every existing guarantee (business-scoped agent selection, RLS, the retry
engine, activity logs) applies to Operational Readiness for free, with zero
new isolation logic to get wrong.

## Alternatives considered

- **One mission, one task per business, all in a loop inside `run()`** —
  rejected. That task would need to open a second, informal notion of
  "business context" inside a single `RunContext`, exactly the shortcut
  requirement 3 ("never let business data leak between businesses") rules
  out. A bug in that loop leaks silently; a bug in mission-per-business is a
  bug in the ordinary mission engine, already covered by every existing test.
- **Attach the first business found to the system mission** — explicitly
  rejected by the operator, and would have been wrong regardless: a readiness
  check that only ever checked one business while claiming to check "the
  system" is worse than an honest refusal.
- **A cross-mission task dependency** (make `package`-style steps in the
  parent wait on tasks in other missions) — rejected. `getRunnableTasks`
  and `releaseUnblockedTasks` are scoped to one mission's own
  `task_dependencies` on purpose; extending them to reach across missions
  would complicate the one thing they are relied on to get right everywhere
  else. A parent mission with **no tasks**, whose status is derived from its
  children instead (`deriveParentMissionState`), needed no such extension.

## Trade-offs

The parent mission needed an explicit `allowNoSteps` escape hatch from
`createMission`'s "a mission needs at least one step" invariant — a real,
if narrow, weakening of a rule that exists to stop a mission getting stuck
with nothing runnable. Kept narrow: it is opt-in, and every ordinary caller
still gets the original guard.

## Consequences

- `missions.parent_mission_id` (migration `0010`) — nullable, self-referencing.
- `recomputeMission()` now recurses: a child's status change propagates to
  its parent, which is how the parent ever learns all its children finished,
  regardless of the order they finish in or whether one was retried.
- The report-building step (`finalizeReadinessReport`) lives outside
  `lib/workflows/engine.ts` and is reached by dynamic import, so the mission
  engine itself stays domain-agnostic — it knows "a mission can have
  children," not "what a readiness report looks like."

## Related

- [[Operational Readiness]]
- [[Capability Scope]]
- [[Mission Engine]]
