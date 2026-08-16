---
status: stable
created: 2026-08-03
updated: 2026-08-16
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

**Code** — `lib/workflows/engine.ts`, `lib/agents/context.ts`, `lib/workflows/reclaim.ts`

## Responsibilities

- One `tasks` row per step, keyed by `step_key`
- `task_dependencies` edges between them
- Status: `queued` → `running` → `completed` / `failed` / `cancelled` / `approval` / `waiting`
- Recover a `running` task whose process died mid-execution, without ever
  touching one that is genuinely still working

## There is no background worker

Every task runs synchronously inside whatever request called
`runAgent`/`runMission` — an operator command, an approval, a retry click, a
scheduled fan-out. Nothing polls, nothing queues in the durable sense, and
nothing keeps working once that one request's response is sent.
[[Job Queue|`InProcessJobQueue`]] is not an exception to this: it is a
synchronous, awaited wrapper that adds observability (`provider_jobs` rows),
never concurrency or durability. This is deliberate and load-bearing for a
system with no persistent server process to run a worker in — but it means a
task can only ever leave `running` because the same request that put it
there finishes normally. If that process dies first — a dev-server restart,
a crashed container, a deploy — the task is orphaned: `running` in storage
forever, with nothing left anywhere actually working on it.

## Claim, heartbeat, and how staleness is told from real work

Three columns (`0012_task_lifecycle.sql`) exist to tell an orphaned task
apart from one still genuinely inside a long provider call:

- **`claimed_at`** — set the moment the runner picks the task up, just before
  `runAgent` begins. Distinct from `started_at` (the handler actually
  beginning): a gap between the two is itself diagnostic.
- **`heartbeat_at`** — bumped at every progress milestone (`runAgent`, 5% /
  25% / 75%) while `running`. The only evidence available for staleness.
- **`reclaim_count`** — how many times this task has already been returned to
  `queued` after being found stale. Bounded at 3; a task that keeps dying the
  same way ends in `failed`, with a reason, rather than being reclaimed
  forever.

`reclaimStaleTasks()` (`lib/workflows/reclaim.ts`) scans `running` tasks for
this owner (optionally scoped to one mission) and compares each one's last
heartbeat against a threshold keyed to its capability:

| Capability class | Threshold | Examples |
| --- | --- | --- |
| Fast, deterministic, no AI | 2 min | `system.readiness.audit`, `business.readiness.check` |
| Media generation / render / publish | 60 min | `youtube.video_assemble`, `youtube.voiceover.generate`, `etsy.artwork.generate`, `youtube.publish`, … |
| Everything else (a single AI call) | 15 min | default |

A task past its threshold is either requeued (`reclaim_count` incremented,
`claimed_at`/`heartbeat_at` cleared) or, once already reclaimed 3 times,
failed outright with a clear reason. It is called from three places:

- `runMission`'s very start, before its own loop — reclaims this mission's
  own orphaned work before attempting to advance it.
- `retry_mission` (`app/api/missions/[id]/control/route.ts`) — reclaims,
  then resets failed/cancelled steps, before running again.
- `buildSnapshot` (`lib/state/snapshot.ts`) — every state read passively
  reclaims and recomputes affected missions, so the operator sees a task
  recover just by having the page open, with no separate action required.

## Mission status never outruns what actually happened

`deriveMissionState` maps "nothing running, but something queued" to
mission status `planning`, not `running` — a mission whose only task has
never actually started must not read as "in progress". See
[[A Missing Agent Left A Readiness Task Queued Forever]] for the bug this
closes and why `planning` (not a new status) is the correct destination:
every caller that treats a mission as "in progress" already groups
`planning` with `running`.

## Inputs

- Planned steps from the [[Workflow Engine]]

## Outputs

- Runnable task list; released tasks; cancelled dependents; reclaimed and
  failed-out stale tasks

## Dependencies

- [[Mission Engine]]
- [[Retry Engine]]

## Failure modes

- **Step keys collide** → outputs overwrite each other. Fixed; see [[Step Key Collision]].
- **`previousOutputs` read by a fixed key** → misses AI-planned missions. Fixed; see [[Script Not Found In AI Planned Missions]].
- **A task with no assigned agent was excluded from the runnable list** →
  stayed `queued` forever, invisible to the one thing that could fail it
  cleanly. Fixed; see
  [[A Missing Agent Left A Readiness Task Queued Forever]].
- **A `running` task's owning process died** → stayed `running` forever with
  nothing working on it, indistinguishable from real progress. Fixed by
  `reclaimStaleTasks()`, above.

## Future improvements

- Visualise the graph in the UI (currently only via [[Mission Trace API]])
- Surface `claimed_at`/`heartbeat_at` history (not just the current value) if
  a task's lifecycle is ever disputed

## Related

- [[Mission Engine]]
- [[Retry Engine]]
- [[Mission Trace API]]
- [[tasks]]
- [[A Missing Agent Left A Readiness Task Queued Forever]]
