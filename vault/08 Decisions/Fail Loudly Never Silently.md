---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A step may fail; it may never proceed on nothing
adr: 6
decided: 2026-07
related:
  - [[Script Not Found In AI Planned Missions]]
  - [[Agent Engine]]
  - [[Mission Trace API]]
tags:
  - decision
  - adr
---

# ADR-006 — Fail Loudly Never Silently

> [!success] Decision
> Where a step cannot find what it needs, it fails with an error naming every place it looked.

**Status** — accepted

## Reason

The fact checker once substituted `(script unavailable)` and produced a real
approval for a script it never read. The mission looked like it had passed a
verification it had never performed.

## Alternatives considered

- **Defaulting to a placeholder** — this was the old behaviour and caused [[Script Not Found In AI Planned Missions]].
- **Failing with a generic message** — insufficient; one message for several faults is several bugs.

## Trade-offs

More failures are visible. That is the point, but it feels worse before it feels better.

## Consequences

Errors carry the full search: which ids were considered, and what was found at each.

## Related

- [[Script Not Found In AI Planned Missions]]
- [[Agent Engine]]
- [[Mission Trace API]]
