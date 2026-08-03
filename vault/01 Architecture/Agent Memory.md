---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Durable rules an operator approved
related:
  - [[Business Memory]]
  - [[agent_memory]]
tags:
  - architecture
---

# Agent Memory

> [!info] Purpose
> An agent proposes a rule; the operator approves it; it shapes every later run for that business.

**Code** — `lib/agents/context.ts`

## Responsibilities

- Store proposed rules, gated by a `memory` approval
- Load the relevant ones into each run

## Inputs

- A proposal from an agent; an operator decision

## Outputs

- Prompt text in `baseContext`

## Dependencies

- [[Approval System]]
- [[Agent Engine]]

## Failure modes

- **Unbounded memory** → capped per run so the prompt stays affordable.

## Future improvements

- Memory decay and review prompts for stale rules

## Related

- [[Business Memory]]
- [[agent_memory]]
