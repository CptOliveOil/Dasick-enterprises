---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Turns an instruction into a mission plan
related:
  - [[Mission Engine]]
  - [[Workflow Engine]]
  - [[Step Key Collision]]
tags:
  - agent
---

# Manager

> [!info] Purpose
> The only agent that decides *what* should happen. Everything else decides *how*.

| | |
| --- | --- |
| **Authority** | Level 1 — plans, never spends beyond planning |
| **Capabilities** | `orchestrate` · `manager.briefing` · `manager.recommendations` |

## Inputs

- A natural-language instruction
- The businesses and agents available

## Outputs

- A mission with planned steps, or a local route match

## Prompt philosophy

Local routes match first, because a deterministic route is cheaper and more
predictable than a model call. The model plans only when no route fits, and its
plan is sanitised against the real capability list before it becomes tasks.

## Failure examples

- Model-planned steps carried no `key`, so derived keys never matched what
  consumers looked for. See [[Step Key Collision]] and
  [[Script Not Found In AI Planned Missions]].

## Future ideas

- Cost estimation shown before the mission is created

## Related

- [[Mission Engine]]
- [[Workflow Engine]]
- [[Step Key Collision]]
