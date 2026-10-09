---
status: resolved
created: 2026-10-09
updated: 2026-10-09
owner: fayaz
summary: After script approval the pipeline ran six steps and stopped, reading "Planning", until someone pressed Advance; overlapping runs could execute the same task twice
severity: high
commit:
resolved: 2026-10-09
related:
  - [[Mission Engine]]
  - [[Faceless YouTube Video]]
tags: [bug]
---

# Production Stalled After Six Steps

> [!bug] Problem
> Approve the script, walk away, come back: the video is not at final review.
> The mission shows **Planning** at ~60%, with thumbnails done and metadata
> queued, and nothing running.

## Symptoms
Reproduced in the October 2026 recovery with `next start` in Demo Mode: the
approval response listed six completed steps (narration plan → thumbnail
images) with `haltedBecause: null` and mission status `planning`. Only a POST
to `/api/missions/:id/run` (the **Advance** button) moved it on.

## Root cause
`runMission` has a per-request ceiling (`maxSteps`, default 6) so a request
can answer inside `maxDuration`. That is right. What was missing is anything
that carries on afterwards: there is no worker, and the routes returned as if
the mission had stopped for a reason. The production tail after the script
gate is thirteen steps.

The suite never saw it — every pipeline test passed `maxSteps: 40`.

A second, latent fault sat next to it: two overlapping `runMission` calls for
the same mission (an Advance double-click) both read the same queued task and
both ran it. Reverting the lock makes `tests/continuation.test.ts` produce two
research packages from one mission — two model bills for one piece of work.

## Fix
- `RunMissionResult.hasMore` — true when the ceiling, not the work, ended the
  call.
- `continueMission` loops `runMission` while `hasMore` (bounded by rounds).
- `continueAfterResponse` schedules that with Next's `after()` from the
  command, approval, run, control and idea routes.
- `runMission` serialises calls per mission in-process.

Not changed: the ceiling itself, the mission status labels, or the absence of
a separate worker (a deliberate simplicity choice; see [[Mission Engine]]).

## Tests added
`tests/continuation.test.ts` — default ceiling reports `hasMore`;
`continueMission` reaches the final review with no click; overlapping runs
produce one research package (verified failing with the lock removed).

## Commit
(see git log — "Keep missions running past the per-request step ceiling")

## Lessons learned
A test that raises a limit to make the pipeline fit is a test that cannot see
the limit. Run at least one end-to-end path on the defaults the operator gets.
"Bounded per request" needs an answer to "and then what?" — otherwise the
bound silently becomes the end.

## Related
- [[Mission Engine]]
- [[A Missing Agent Left A Readiness Task Queued Forever]]
