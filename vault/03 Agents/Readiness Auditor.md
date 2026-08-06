---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Checks configuration, never content
related:
  - [[Operational Readiness]]
  - [[Business Readiness]]
  - [[Shared Infrastructure Audit]]
tags:
  - agent
---

# Readiness Auditor

> [!info] Purpose
> Runs both halves of an Operational Readiness check — a global agent, like
> the SEO Agent, because readiness is never one business' concern alone.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `system.readiness.audit`, `business.readiness.check` |

## Inputs

- For the system audit: nothing beyond the workspace itself
- For a business check: the business its task is scoped to

## Outputs

- A verdict (`ready` / `attention`) and findings, per area, read back into
  [[Operational Readiness]]'s one final report

## Prompt philosophy

Not a prompt at all — both capabilities are provider-mode, reading real
configuration (agents assigned, channels and stores present, providers
connected, the current mode) rather than asking a model to assess anything.
A readiness check that could hallucinate would be worse than none.

## Failure examples

- n/a — new agent, no incidents recorded yet.

## Future ideas

- None outstanding.

## Related

- [[Operational Readiness]]
- [[Business Readiness]]
- [[Shared Infrastructure Audit]]
