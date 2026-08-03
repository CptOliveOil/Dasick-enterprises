---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Opportunity research
related:
  - [[Etsy]]
  - [[etsy_opportunities]]
  - [[Etsy Product Designer]]
tags:
  - agent
---

# Etsy Researcher

> [!info] Purpose
> Find listing opportunities.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `etsy.research.opportunities` |

## Inputs

- A niche

## Outputs

- `etsy_opportunities` rows

## Prompt philosophy

Demand research is separated from what is legally sellable.

## What happens after this agent's work

An opportunity is a proposal, not a decision. The operator approves one from
`/etsy/opportunities`, which starts an [[Etsy Product Build]] mission handed
to [[Etsy Product Designer]] — this agent does not build anything itself.

## Failure examples

- n/a

## Future ideas

- None outstanding.

## Related

- [[Etsy]]
- [[etsy_opportunities]]
- [[Etsy Product Designer]]
