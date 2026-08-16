---
status: stable
created: 2026-08-03
updated: 2026-08-16
owner: fayaz
summary: Checks configuration, never content
related:
  - [[Operational Readiness]]
  - [[Business Readiness]]
  - [[Shared Infrastructure Audit]]
  - [[A Missing Agent Left A Readiness Task Queued Forever]]
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

- Any account provisioned before this agent existed in `AGENT_SEEDS` never
  received it — `provisionWorkspace` only seeds a genuinely empty workspace,
  so it never re-ran for an existing one. Every readiness task on such an
  account was created with `agent_id: null`, permanently, and sat `queued`
  forever with nothing able to resolve it. See
  [[A Missing Agent Left A Readiness Task Queued Forever]].
  `resolveAgentForCapability` and `provisionWorkspace` now both backfill it
  on an already-provisioned account, by slug, without duplicating it or
  touching anything else.

## Future ideas

- None outstanding.

## Related

- [[Operational Readiness]]
- [[Business Readiness]]
- [[Shared Infrastructure Audit]]
- [[A Missing Agent Left A Readiness Task Queued Forever]]
