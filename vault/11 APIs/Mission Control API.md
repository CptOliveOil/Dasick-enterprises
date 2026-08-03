---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Operator interventions: pause, resume, cancel, skip a task, reassign, retry failed steps.
method: POST
path: /api/missions/[id]/control
related:
  - [[Retry Engine]]
  - [[Task Graph]]
  - [[Mission Engine]]
tags:
  - api
---

# Mission Control API

```http
POST /api/missions/[id]/control
```

Operator interventions: pause, resume, cancel, skip a task, reassign, retry failed steps.

## Authentication

Session cookie; `missions.create`.

## Request

```json
{ "action": "retry_mission" }
```

## Response

```json
{ "retried": 3, "kept": 9, "run": { "status": "running" }, "mission": { … } }
```

## Errors

`retry_mission` re-queues **only** failed steps and their collateral-cancelled
dependents. Completed work is never re-run and never re-paid. Returns 409 when
there is nothing to retry.

## Related

- [[Retry Engine]]
- [[Task Graph]]
- [[Mission Engine]]
