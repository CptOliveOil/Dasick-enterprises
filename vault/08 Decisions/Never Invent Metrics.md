---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Unknown is a value
adr: 8
decided: 2026-07
related:
  - [[Business Memory]]
  - [[Analytics]]
  - [[mission_outcomes]]
tags:
  - decision
  - adr
---

# ADR-008 — Never Invent Metrics

> [!success] Decision
> Every performance figure starts null and stays null until something measures it. Revenue and impressions are not requested from the analytics API at all.

**Status** — accepted

## Reason

Zero for an unmonetised channel would be recorded as "earned nothing" rather
than "not measured", and that figure feeds [[Business Memory]] and every future
prompt.

## Alternatives considered

- **Defaulting to zero** — rejected; indistinguishable from a real zero.
- **Estimating from views** — rejected; an estimate in a memory brief becomes a fact.

## Trade-offs

Dashboards show gaps. The brief says "not yet known" rather than omitting the line.

## Consequences

An agent is never told a video did well when nobody measured it.

## Related

- [[Business Memory]]
- [[Analytics]]
- [[mission_outcomes]]
