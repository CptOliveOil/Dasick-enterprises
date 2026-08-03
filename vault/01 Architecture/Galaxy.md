---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The workforce as a solar system
related:
  - [[Mission Engine]]
  - [[activity_logs]]
tags:
  - architecture
---

# Galaxy

> [!info] Purpose
> Agents are planets on rings; real handoffs fly a small craft between them. It is a view of live state, never a decoration.

**Code** — `components/galaxy/*`

## Responsibilities

- Lay out agents on rings, deterministically
- Animate handoffs drawn from real activity logs
- Dim unrelated planets on focus

## Inputs

- The workspace snapshot and recent `handoff` activity

## Outputs

- A rendered scene; no persisted state

## Dependencies

- [[Notifications]]
- [[Task Graph]]

## Failure modes

- **Fake motion** → forbidden. Rockets are triggered only by real handoff activity.
- **No WebGL** → a keyboard-navigable list stands in.

## Future improvements

- Mission-scoped focus mode

## Related

- [[Mission Engine]]
- [[activity_logs]]
