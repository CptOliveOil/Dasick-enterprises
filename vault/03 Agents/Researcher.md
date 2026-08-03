---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Builds the factual package a script is written from
related:
  - [[Fact Checker]]
  - [[youtube_research]]
  - [[Structured Output Validation Failure]]
tags:
  - agent
---

# Researcher

> [!info] Purpose
> Produce facts, statistics, a timeline, hooks and risks — each with a source or an explicit admission that there is none.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.research.package` · `youtube.research.ideas` |

## Inputs

- A topic or an approved idea

## Outputs

- A `youtube_research` row

## Prompt philosophy

Sources are demanded per claim. A claim with no source is recorded as
unsourced rather than dropped, because the absence is itself information for the
[[Fact Checker]] and the [[Approval Dossier]].

## Failure examples

- Eleven array fields against a 4,096-token ceiling truncated the response. See [[Structured Output Validation Failure]].

## Future ideas

- Real web search, so sources are fetched rather than recalled

## Related

- [[Fact Checker]]
- [[youtube_research]]
- [[Structured Output Validation Failure]]
