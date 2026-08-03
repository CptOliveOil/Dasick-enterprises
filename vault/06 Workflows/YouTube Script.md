---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Research, script and fact check — no production
key: youtube_script
related:
  - [[Faceless YouTube Video]]
  - [[Scriptwriter]]
tags:
  - workflow
---

# YouTube Script

> [!info] Definition
> `youtube_script` in `lib/workflows/definitions.ts`

## Diagram

```mermaid
flowchart LR
    R[research] --> S[script] --> F[fact_check]
    F -.->|⛔| END[Approved script]
```

## Steps

Three steps. Used when the operator wants a script without committing to a render.

## Approvals

The script approval.

## Retries

Per step.

## Expected outputs

An approved script.

## Artifacts produced

`youtube_research` · `youtube_scripts` · `youtube_fact_checks`

## Related

- [[Faceless YouTube Video]]
- [[Scriptwriter]]
