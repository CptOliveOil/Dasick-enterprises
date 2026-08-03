---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Telling the operator what needs them
related:
  - [[Approval System]]
  - [[notifications]]
tags:
  - architecture
---

# Notifications

> [!info] Purpose
> Notifications exist for the things a person must act on: an approval, a blocked step, a missing provider, a completed mission.

**Code** — `lib/agents/activity.ts`, `lib/operations/needs-you.ts`

## Responsibilities

- Write `notifications` rows
- Surface them in the operating layer

## Inputs

- Events from the engine

## Outputs

- Notification rows and the "needs you" list

## Dependencies

- [[Agent Engine]]
- [[Approval System]]

## Failure modes

- **Notification storm** → kinds are deliberately few; routine progress is activity, not a notification.

## Future improvements

- Push and email delivery

## Related

- [[Approval System]]
- [[notifications]]
