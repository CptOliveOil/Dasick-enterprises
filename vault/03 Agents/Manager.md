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
  - [[Capability Scope]]
  - [[Operational Readiness]]
tags:
  - agent
---

# Manager

> [!info] Purpose
> The only agent that decides *what* should happen — including, since
> [[Capability Scope]], deciding what *scope* it should happen at. Everything
> else decides *how*.

| | |
| --- | --- |
| **Authority** | Level 1 — plans, never spends beyond planning |
| **Capabilities** | `orchestrate` · `manager.briefing` · `manager.recommendations` |

## Inputs

- A natural-language instruction
- The businesses and agents available

## Outputs

- A mission with planned steps, a local route match, or — for a system-wide
  instruction — an [[Operational Readiness]] run: one parent mission and its
  children, never squeezed into one mission

## Prompt philosophy

Local routes match first, because a deterministic route is cheaper and more
predictable than a model call. The model plans only when no route fits, and its
plan is sanitised against the real capability list before it becomes tasks.

Before either path reaches `createMission`, every step's capability is
checked against [[Capability Scope]]: a `business`-scoped capability with no
business resolved gets a plain-language reply asking which business, rather
than a mission that would fail its own first task. Recognising an
`OPERATIONAL_READINESS` phrase ("readiness check", "is the system ready")
bypasses single-mission planning entirely — see [[Operational Readiness]].

## Failure examples

- Model-planned steps carried no `key`, so derived keys never matched what
  consumers looked for. See [[Step Key Collision]] and
  [[Script Not Found In AI Planned Missions]].
- A system-level readiness check had no way to run business-scoped work
  without either guessing a business or failing three layers down. See
  [[Operational Readiness Fans Out Instead Of Guessing A Business]].

## Future ideas

- Cost estimation shown before the mission is created

## Related

- [[Mission Engine]]
- [[Workflow Engine]]
- [[Step Key Collision]]
- [[Capability Scope]]
- [[Operational Readiness]]
