---
status: resolved
created: 2026-08-16
updated: 2026-08-16
owner: fayaz
summary: A task with no assigned agent was excluded from the runnable list, so it sat queued forever and its mission misread as Running
severity: critical
commit: a37396f
resolved: 2026-08-16
related:
  - [[Task Graph]]
  - [[Mission Engine]]
  - [[Retry Engine]]
  - [[Operational Readiness]]
  - [[Operational Readiness Fans Out Instead Of Guessing A Business]]
  - [[tasks]]
tags:
  - bug
---

# A Missing Agent Left A Readiness Task Queued Forever

> [!bug] Problem
> After the Operational Readiness fan-out fix (see
> [[Operational Readiness Fans Out Instead Of Guessing A Business]]), every
> child mission of a real Operational Readiness run got stuck showing
> **Running, 0/1, 0%** for hours:
>
> ```
> #008 YouTube readiness              Running   0/1   0%
> #009 Etsy readiness                 Running   0/1   0%
> #010 Islamic Channel readiness      Running   0/1   0%
> #011 Shared infrastructure audit    Running   0/1   0%
> Parent #007 Operational Readiness   Running   0/0   0%
> ```
>
> The fan-out itself was correct — four child missions, each with the right
> business scope, exactly as designed. This was a separate bug, one layer
> down: the one task inside each child never actually ran.

## Symptoms

- A mission's only task never leaves `queued` (or, if a request had actually
  reached `runAgent` for it before this fix existed and then died mid-run,
  `running`) and the mission itself never leaves a status that reads as "in
  progress" — no matter how long is waited, no error, no retry option, no
  visible reason.
- Reproduced most reliably on a workspace that was provisioned *before* the
  Readiness Auditor agent was added to `AGENT_SEEDS` — i.e. a real account
  that existed prior to the fix in
  [[Operational Readiness Fans Out Instead Of Guessing A Business]] — but the
  underlying defect applies to *any* task created with no eligible agent,
  for any capability.

## Root cause

Two independent bugs, both needed to reach this exact symptom, plus a third
that made the state permanent for real accounts:

**1. A task with no agent was excluded from the runnable list, not merely
run and failed.** `createMission` (`lib/workflows/engine.ts`) has always
handled "no agent provides this capability" gracefully at creation time —
the task is still created, `status: 'queued'`, with `agent_id: null` and a
pre-filled `error` naming the gap. That part was correct and unchanged.
But `getRunnableTasks` filtered `if (!task.agent_id) return false;` — so
that task was never even offered to `runAgent`, the one place that would
ever have turned "no agent" into a terminal `failed` status. `runMission`'s
loop found nothing runnable, broke immediately, and the task sat `queued`
forever, completely invisible to anything that could resolve it.

**2. `deriveMissionState` mapped "nothing running, but something queued" to
mission status `running`.** So a mission that had *never executed a single
task* displayed identically to one genuinely in progress — the exact
"Running, 0/1, 0%, for two hours" the report described. There was no way to
tell the two apart from the UI.

**3. Provisioning never backfills an existing account.**
`provisionWorkspace` (`lib/workspace/provision.ts`) is deliberately
idempotent — if a workspace already has agents, it does nothing, so
re-running setup never spawns a second Manager. But that means an account
provisioned *before* the Readiness Auditor existed in `AGENT_SEEDS` never
gets it: nothing re-seeds an existing workspace when the roster grows. Every
`business.readiness.check` / `system.readiness.audit` task on such an
account was created with `agent_id: null`, permanently, until this fix.

Separately audited and ruled out, explicitly, per the report's own list of
suspects:

- **No background worker exists.** Every task runs synchronously inside
  whatever request calls `runAgent`/`runMission` — confirmed by grepping
  every `Promise.all(...runMission...)` call site
  (`app/api/command/route.ts`, properly awaited) and finding no
  fire-and-forget pattern anywhere in `app/api/`.
- **A server restart does not, by itself, lose in-memory state** — the store
  is the only thing that needs to survive, and every write in this system
  goes straight to it. It *can* orphan a task if the restart happens
  mid-`runAgent`, which is real and is what the new `claimed_at`/
  `heartbeat_at`/`reclaim_count` machinery (see [[Task Graph]]) now
  recovers from — but it was not what produced this specific report.
- **No lease/lock/status mismatch.** There was never a lease to begin with;
  that is precisely the gap this fix closes.

## Investigation

Wrote a reproduction (`tests/task-lifecycle.test.ts`) that removed the
Readiness Auditor agent from an otherwise fully-provisioned workspace and
called `runMission` on the resulting readiness child. First run showed
`run.status === 'running'`, not a thrown error — disproving an earlier,
narrower theory (that `runAgent`'s guard clauses `throw`ing raw errors was
the whole story) and pointing at `getRunnableTasks` excluding the task
before `runAgent` was ever called. Traced `deriveMissionState` separately to
find the `counts.queued > 0 → 'running'` mapping that made the resulting
`queued`-forever task display as "Running".

## Fix

- **`getRunnableTasks`** (`lib/workflows/engine.ts`) no longer excludes a
  task with `agent_id: null`. It is runnable in the sense that matters here:
  it is next in line, and `runAgent` is the only thing that can turn "no
  agent" into a real, terminal status.
- **`runAgent`** (`lib/agents/engine.ts`) no longer `throw`s for `!task.agent_id`
  or a deleted agent — both now call a new `failTaskOnly()` (a `fail()`
  variant with no `Agent` row to update), which fails the task cleanly and
  logs/notifies exactly like every other failure path. This is also what
  makes it safe inside `Promise.all(missions.map(runMission))`: one
  mission's missing agent can no longer take down the request reporting on
  every sibling mission alongside it.
- **`deriveMissionState`** now maps `counts.queued > 0` to mission status
  `planning`, not `running` — not a new status; `planning` already means
  "nothing has happened yet" everywhere else it is used, and every caller
  that treats a mission as "in progress" already groups `planning` with
  `running` (`deriveParentMissionState`, `MissionInspector.tsx`,
  `lib/operations/quick-commands.ts`).
- **`resolveAgentForCapability`** (`lib/workflows/engine.ts`) now backfills
  a missing *global* agent before accepting "no agent" as final — see
  `reconcileGlobalAgents()` in `lib/workspace/provision.ts`. Deliberately
  global-only: a missing per-business agent needs a business to attach it
  to, a different case this codebase has not needed. `provisionWorkspace`
  calls the same reconciliation on an already-provisioned account, so
  either path (a new mission needing the capability, or re-running setup)
  closes the gap.
- **Stale-task recovery** (`claimed_at`, `heartbeat_at`, `reclaim_count`,
  `lib/workflows/reclaim.ts`, migration `0012_task_lifecycle.sql`) — added
  as protection for the separate, real scenario this investigation
  deliberately ruled out for *this* report but which the same architecture
  is exposed to: a task that reached genuine `running` and then had its
  owning process die. See [[Task Graph]] for the full mechanism.
- **`retry_mission`** (`app/api/missions/[id]/control/route.ts`) reclaims
  stale tasks first, recognises an un-attempted `queued` task as something
  to retry (it used to 409 with "nothing to retry"), and — for a parent
  orchestrator mission with no tasks of its own — cascades into every child
  that has not reached a terminal state. See [[Retry Engine]].
- **Observability** — `describeTaskLifecycle()` (`lib/agents/status.ts`),
  rendered per task in `MissionInspector.tsx`: Created / Claimed / Started /
  Completed-or-Failed, plus a plain "likely stale" flag for a `running` task
  whose heartbeat has gone quiet — so the operator never has to open a
  database table to know whether a task is actually alive.

## Recovering the reported #007–#011 missions

The exact rows behind this report cannot be inspected or repaired from this
environment — this was traced and fixed entirely against `RlsMemoryStore`, a
test double, per the "do not modify my data manually" instruction. What the
fix means for them, precisely:

- If a child's task is `queued` with `agent_id: null` (the mechanism this
  page documents): opening that child mission and pressing **Retry** (or
  **Advance**, which now works too) calls `runMission` again. With the fix
  deployed, `resolveAgentForCapability` backfills the Readiness Auditor on
  the spot if it is genuinely missing, and the task completes — it does not
  need a new mission.
- If a child's task somehow reached genuine `running` before its process
  died (the separate scenario `reclaimStaleTasks` covers): the same
  **Retry**/**Advance** action reclaims it first, then runs it.
- Pressing **Retry** on the *parent* (#007) now cascades to every
  not-yet-terminal child in one action — try that first.
- If, after the fix, a child's task still fails (a genuinely different
  problem — a capability whose only agent is legitimately disabled, for
  example), it will now fail **cleanly**, with a clear `error`, rather than
  hanging — which is itself the signal to look at that specific error rather
  than start over.
- If retrying does not resolve a specific child, starting a **new**
  Operational Readiness mission is safe and will not conflict with the old
  one — nothing about this fix makes an old, still-stuck mission block a new
  one.

No manual Supabase commands are required beyond applying migration
`0012_task_lifecycle.sql` (additive only — new nullable/defaulted columns
and one partial index; safe against 0001–0011, no backfill needed).

## Tests added

- `tests/task-lifecycle.test.ts` — reproduces the exact stuck state (a
  disabled Readiness Auditor, business capability, real RLS-shaped store);
  proves it fails cleanly rather than hanging or throwing; proves sibling
  missions in the same `Promise.all` batch are unaffected; proves the
  provisioning-drift backfill closes the gap for an account missing the
  agent entirely, without duplicating an agent that already exists.
- `tests/reclaim.test.ts` — twelve tests: a child task claimed and
  completed with every timestamp set; survives a simulated restart between
  queue and execution; reclaims a genuinely stale `running` task and leaves
  a genuinely active one alone; fails a task outright once reclaimed the
  maximum number of times; parent recompute after a reclaimed child
  completes; both readiness capabilities confirmed `mode: 'provider'` (no
  AI); a fresh mission completes with `ANTHROPIC_API_KEY` unset; a single
  `runMission` call takes `queued` to `completed` with nothing else running;
  retry-after-reclaim completes exactly once; reclaim never re-touches an
  already-completed task (no duplicate cost); reclaim scoped to one mission
  never touches a stale task in a sibling business's mission.
- `tests/readiness.test.ts` — end-to-end test running the exact production
  path (`handleCommand` + `Promise.all(missions.map(runMission))`) across
  three businesses plus shared infrastructure, proving every child reaches
  a terminal state, the parent waits correctly, and the aggregate report is
  generated — no child left `Running` indefinitely.
- `tests/mission-state.test.ts` — `deriveMissionState`'s `planning` mapping;
  `describeTaskLifecycle`'s never-picked-up, stale, in-progress, and
  completed/failed-with-duration cases.

## Commit

`a37396f`

## Lessons learned

**A graceful-looking failure at creation time is not the same as a graceful
failure overall.** Creating the task with `agent_id: null` and a clear
`error` looked like the system had already handled the gap — the message
was right there on the row. But nothing downstream ever *read* that error
and acted on it, because the task never reached the one function that
would have. A clear error on a row nobody looks at is not an error handled;
it is an error recorded and then ignored.

**"In progress" and "nothing has happened yet" must never share a status.**
`running` meant both "a task is genuinely executing" and "a task is merely
queued" for as long as `counts.queued > 0` mapped there. Once two
meaningfully different states share one label, the UI cannot tell an
operator which one they are looking at, and neither can any code that reads
mission status as a signal.

**Idempotent provisioning has a blind spot: growth.** "Never re-provision an
account that already has agents" is the right rule for avoiding a second
Manager — and the wrong rule, unmodified, for a roster that grows over time.
Idempotency by presence-of-any-agents silently became idempotency-forever,
for every account that existed before the roster grew. The fix keeps the
original guarantee (no duplicate agents, no duplicate businesses) while
closing the gap it created (a specific, named, missing agent gets backfilled
by slug).

**Ruling scenarios out explicitly, in writing, is itself part of the fix.**
The report asked for ten specific hypotheses to be checked one by one. Most
were correctly not the cause — but writing down *why* each was ruled out
(no background worker exists at all; a restart alone does not lose store
state; there was never a lease to mismatch) is what makes the two real
causes credible, and is what a stale-task reclaim mechanism protects against
even though it was not what produced this particular report.

## Related

- [[Task Graph]]
- [[Mission Engine]]
- [[Retry Engine]]
- [[Operational Readiness]]
- [[Operational Readiness Fans Out Instead Of Guessing A Business]]
- [[tasks]]
