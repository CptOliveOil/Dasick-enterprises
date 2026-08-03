---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Re-run exactly what failed, and nothing that succeeded
related:
  - [[Task Graph]]
  - [[Mission Engine]]
  - [[Approval System]]
tags:
  - architecture
---

# Retry Engine

> [!info] Purpose
> Retrying must never re-pay for completed work. Only failed steps and the steps cancelled because of them are re-queued.

**Code** — `app/api/missions/[id]/control/route.ts`, `lib/approvals/rework.ts`

## Responsibilities

- Re-queue `failed` tasks and their collateral-cancelled dependents
- Leave completed steps untouched
- Route a changes-requested approval to a rework task rather than re-running the step that raised it

## Inputs

- A mission id and a control action

## Outputs

- Re-queued tasks; a rework task where a capability exists to redo the work

## Dependencies

- [[Task Graph]]
- [[Approval System]]

## Failure modes

- **Re-running a completed step** → would re-pay. Prevented by status filtering.
- **Rework with no capable agent** → falls back to re-queueing the original step.

## Future improvements

- Retry with a different model or provider
- Partial retry within a step (per scene)

## Related

- [[Task Graph]]
- [[Mission Engine]]
- [[Approval System]]
