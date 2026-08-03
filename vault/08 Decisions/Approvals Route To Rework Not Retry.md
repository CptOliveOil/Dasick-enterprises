---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Changes requested go to the agent that can act
adr: 14
decided: 2026-07
related:
  - [[Approval System]]
  - [[Retry Engine]]
  - [[Scriptwriter]]
tags:
  - decision
  - adr
---

# ADR-014 — Approvals Route To Rework Not Retry

> [!success] Decision
> A changes-requested approval schedules a task for the capability that can redo the work, and the step that raised the approval waits behind it.

**Status** — accepted

## Reason

Re-queueing the approval's own task re-ran the *fact checker* against an unchanged draft, producing the same warnings and discarding the operator's notes.

## Alternatives considered

- **Re-queueing the same step** — the old behaviour; wrong for anything but a spend gate.
- **Restarting the mission** — rejected; it discards completed work.

## Trade-offs

A rework spec must exist per kind. Where none does, the old behaviour stands.

## Consequences

The sequence an editor expects: notes → rewrite → re-check → review again, with every draft kept.

## Related

- [[Approval System]]
- [[Retry Engine]]
- [[Scriptwriter]]
