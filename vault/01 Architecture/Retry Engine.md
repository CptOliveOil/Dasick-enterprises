---
status: stable
created: 2026-08-03
updated: 2026-08-16
owner: fayaz
summary: Re-run exactly what failed, and nothing that succeeded
related:
  - [[Task Graph]]
  - [[Mission Engine]]
  - [[Approval System]]
  - [[Operational Readiness]]
tags:
  - architecture
---

# Retry Engine

> [!info] Purpose
> Retrying must never re-pay for completed work. Only failed steps, the steps cancelled because of them, stale reclaimed steps, and steps that were simply never attempted are re-queued.

**Code** — `app/api/missions/[id]/control/route.ts`, `lib/approvals/rework.ts`, `lib/workflows/reclaim.ts`

## Responsibilities

- Reclaim any stale `running` task first (`reclaimStaleTasks`; see [[Task Graph]])
- Re-queue `failed` tasks and their collateral-cancelled dependents
- Recognise a `queued` task that was never attempted as something to retry
  too — not just something to leave alone waiting for `runMission` to notice
  it on its own
- Leave completed steps untouched
- Route a changes-requested approval to a rework task rather than re-running the step that raised it
- For a pure orchestrator mission (no tasks of its own, only children — see
  [[Operational Readiness]]) — cascade: retry whichever children have not
  reached a terminal state, one call recovering the whole tree

## Why "nothing to retry" had to change

`retry_mission` used to 409 with "nothing to retry" unless a task was
literally `failed` or collateral-`cancelled`. That was wrong for a task that
had never been attempted at all — the exact shape a task with no assigned
agent used to get stuck in (see
[[A Missing Agent Left A Readiness Task Queued Forever]]), and the exact
shape a stale `running` task looks like right after `reclaimStaleTasks`
requeues it. Both are now counted toward `resettable`, so a mission whose
only problem was "nobody ever picked this up" is retryable, not stuck behind
a 409.

## Inputs

- A mission id and a control action

## Outputs

- Reclaimed stale tasks; re-queued tasks; a rework task where a capability
  exists to redo the work; for an orchestrator, one run per retried child

## Dependencies

- [[Task Graph]]
- [[Approval System]]
- [[Operational Readiness]]

## Failure modes

- **Re-running a completed step** → would re-pay. Prevented by status filtering.
- **Rework with no capable agent** → falls back to re-queueing the original step.
- **Retrying a parent orchestrator with no tasks of its own did nothing** →
  the mission's own `tasks` list is always empty; fixed by detecting
  children and cascading into them instead of resetting nothing.

## Future improvements

- Retry with a different model or provider
- Partial retry within a step (per scene)

## Related

- [[Task Graph]]
- [[Mission Engine]]
- [[Approval System]]
- [[Operational Readiness]]
- [[A Missing Agent Left A Readiness Task Queued Forever]]
