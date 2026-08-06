---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: String capability → handler, in two modes
related:
  - [[Agent Engine]]
  - [[03 Agents/Index|Agents]]
  - [[Workflow Engine]]
  - [[Capability Scope]]
tags:
  - architecture
---

# Capability Registry

> [!info] Purpose
> A capability is the smallest unit of work an agent can do. Handlers declare `ai` mode (build a prompt, validate, persist) or `provider` mode (call a provider interface directly). What it *needs* before it can run — a whole workspace, one business, or a prior step's state — is [[Capability Scope]], looked up separately rather than declared on the handler itself.

**Code** — `lib/agents/capabilities.ts`, `lib/agents/production/*`

## Responsibilities

- Map a capability string to its handler
- Declare the Zod schema an `ai` handler validates against
- Expose the handler list for agent capability assignment

## Inputs

- A capability string from a task input

## Outputs

- A `PersistResult`: summary, output, optional approval, optional blocked reason, optional spend

## Dependencies

- [[Agent Engine]] invokes handlers
- [[Provider Layer]] for `provider` mode

## Failure modes

- **A task names an unknown capability** → the step fails loudly rather than defaulting to the agent's first capability.

## Future improvements

- Capability versioning, so a prompt change can be rolled back independently

## Related

- [[Agent Engine]]
- [[03 Agents/Index|Agents]]
- [[Workflow Engine]]
- [[Capability Scope]]
