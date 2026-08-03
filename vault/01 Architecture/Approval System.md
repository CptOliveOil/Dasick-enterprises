---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every gate where a person decides, and the dossier they decide from
related:
  - [[Approval Dossier]]
  - [[Retry Engine]]
  - [[Copyright Review]]
  - [[approvals]]
tags:
  - core
  - architecture
---

# Approval System

> [!info] Purpose
> An approval presents the actual work: a summary you can scan, panels you can read, and actions whose consequences are spelled out. Nobody approves work they cannot inspect.

**Code** — `lib/workflows/approvals.ts`, `lib/approvals/*`

## Responsibilities

- Raise approvals from capability handlers
- Build a dossier per approval kind through a registry
- Apply the decision to the task, the mission and the domain record
- Route "request changes" to the agent that can redo the work

## Inputs

- An approval row, its payload, and whatever the payload points at

## Outputs

- A dossier (summary, panels, actions); a resolved approval; possibly a rework task

## Dependencies

- [[Mission Engine]] continues after a decision
- [[Business Memory]] records outcomes on completion

## Failure modes

- **Payload points at a deleted record** → the generic builder falls back to the payload snapshot and says so.
- **Approving depended on a record existing** → fixed; the decision is recorded even if the record cannot be read.
- **No playable video** → approval for publishing is disabled.

## Future improvements

- Bulk approval for low-risk kinds
- Approval delegation once teams exist

## Related

- [[Approval Dossier]]
- [[Retry Engine]]
- [[Copyright Review]]
- [[approvals]]
