---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: For a workflow definition
related:
tags:
  - template
---

# Workflow Template
> [!note] For a workflow definition


```markdown
---
status: stable
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: fayaz
summary: One line
key: workflow_key
related: []
tags: [workflow]
---

# <Name>

> [!info] Definition
> `workflow_key` in `lib/workflows/definitions.ts`

## Diagram

```mermaid
flowchart TD
    A[step_one] --> B[step_two]
    B -.->|⛔ APPROVAL| C[step_three]
```

## Steps

| Key | Capability | Depends on | Agent |
| --- | --- | --- | --- |

## Approvals
## Retries
## Expected outputs
## Artifacts produced
## Related
```
