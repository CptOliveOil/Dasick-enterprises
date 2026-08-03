---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What a business has learned by doing
related:
  - [[Analytics]]
  - [[Agent Memory]]
  - [[mission_outcomes]]
  - [[Never Invent Metrics]]
tags:
  - core
  - architecture
---

# Business Memory

> [!info] Purpose
> Agent memory holds rules a person approved. Business memory holds outcomes nobody had to agree to, because they happened.

**Code** — `lib/memory/business.ts`

## Responsibilities

- Record one `mission_outcomes` row when a mission completes, idempotent by mission
- Pull real performance from analytics at brief time and write it back
- Render a bounded brief onto the run context, so every agent reads it

## Inputs

- Completed missions; `youtube_analytics` rows when they exist

## Outputs

- A per-business brief injected into every prompt via `baseContext`

## Dependencies

- [[Analytics]] supplies the figures
- [[Agent Engine]] carries the brief

## Failure modes

- **Inventing figures** → forbidden. Every performance column starts null and stays null until measured. A workspace that seeds plausible numbers teaches its own agents to be confident about fiction.
- **Cross-business leakage** → scoped by business; tested.

## Future improvements

- Per-agent memory slices
- Trend detection across outcomes

## Related

- [[Analytics]]
- [[Agent Memory]]
- [[mission_outcomes]]
- [[Never Invent Metrics]]
