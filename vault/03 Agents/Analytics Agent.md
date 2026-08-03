---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Brings real performance back
related:
  - [[Analytics]]
  - [[Business Memory]]
  - [[Never Invent Metrics]]
tags:
  - agent
---

# Analytics Agent

> [!info] Purpose
> Collect what the platform actually reports and feed [[Business Memory]].

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.analytics.collect` · `youtube.analytics.analyse` |

## Inputs

- A published external id

## Outputs

- `youtube_analytics` rows

## Prompt philosophy

Only metrics the API genuinely returns. Revenue is not requested, because zero for an unmonetised channel would be recorded as "earned nothing".

## Failure examples

- Fabricated figures would flow into every future prompt. The simulated provider returns nothing at all.

## Future ideas

- Impressions and CTR with an extra scope

## Related

- [[Analytics]]
- [[Business Memory]]
- [[Never Invent Metrics]]
