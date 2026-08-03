---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: For an external service
related:
tags:
  - template
---

# Provider Template
> [!note] For an external service


```markdown
---
status: not-implemented   # implemented | partial | not-implemented
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: fayaz
summary: One line — what it provides
interface: VoiceProvider
related: []
tags: [provider]
---

# <Name>

> [!info] Implementation status
> **status** — implements `Interface`

## Setup
Numbered steps a non-developer can follow.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |

## Costs
Real figures, erring high.

## Limits
Quotas, sizes, rates.

## Authentication
How, and **where the secret lives**. Never in a URL.

## Failure modes
- **What happens** → what the operator sees and what to do.

## Related
```
