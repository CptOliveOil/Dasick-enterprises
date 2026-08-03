---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The single execution path for every capability
related:
  - [[Capability Registry]]
  - [[Provider Layer]]
  - [[Budget System]]
  - [[Approval System]]
  - [[Business Memory]]
tags:
  - architecture
---

# Agent Engine

> [!info] Purpose
> One function runs every step. Authority, budget, prompting, validation, persistence, cost recording, activity logging and approvals are handled in exactly one place, so a new capability inherits all of it.

**Code** — `lib/agents/engine.ts`, `lib/agents/capabilities.ts`

## Responsibilities

- Load context: agent, task, mission, business, memory, business memory, previous outputs
- Check [[Authority Model]] and [[Budget System]] before spending
- Build the prompt (`ai` mode) or call a provider (`provider` mode)
- Validate structured output against a Zod schema
- Persist the result, record cost, log activity, raise approvals

## Inputs

- A task id

## Outputs

- A persisted domain record, an `api_usage` row, activity entries, optionally an approval

## Dependencies

- [[Capability Registry]]
- [[Provider Layer]]
- [[Business Memory]]
- [[Budget System]]

## Failure modes

- **Structured output fails validation** → one repair attempt, then fail. See [[Structured Output Validation Failure]].
- **Provider not connected** → the step blocks with the variables needed. Never simulated in [[Mode System|Production]].
- **Spend over threshold** → a `spend` approval is raised and the task re-queued.

## Future improvements

- Streaming progress for long provider calls
- Per-capability model selection

## Related

- [[Capability Registry]]
- [[Provider Layer]]
- [[Budget System]]
- [[Approval System]]
- [[Business Memory]]
