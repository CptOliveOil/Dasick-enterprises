---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What an agent is allowed to do without asking
related:
  - [[Agent Engine]]
  - [[Budget System]]
  - [[Security]]
tags:
  - architecture
---

# Authority Model

> [!info] Purpose
> Authority is a level on the agent, checked by the engine before a capability runs. Publishing and spending sit above the default.

**Code** — `lib/agents/authority.ts`, `lib/auth/permissions.ts`

## Responsibilities

- Gate capabilities by agent authority level
- Separate account permissions (owner/admin/member/viewer) from agent authority

## Inputs

- The agent, the capability, the task

## Outputs

- Permitted, or an approval requirement

## Dependencies

- [[Agent Engine]]
- [[Approval System]]

## Failure modes

- **A capability added without an authority rule** → defaults to requiring the higher level rather than the lower.

## Future improvements

- Per-business authority overrides

## Related

- [[Agent Engine]]
- [[Budget System]]
- [[Security]]
