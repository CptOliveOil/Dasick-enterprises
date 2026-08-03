---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: For a planned capability
related:
tags:
  - template
---

# Feature Template
> [!note] For a planned capability


```markdown
---
status: planned
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: fayaz
summary: One line
related: []
tags: [feature, planned]
---

# <Name>

> [!abstract] What and why
> One paragraph. What can the operator do afterwards that they cannot now?

## Scope
### In
### Out — explicitly

## Design
Which existing systems it uses. **Reuse before adding.**

## Data
New tables or columns → a new numbered migration. Never edit an applied one.

## Approvals
Does it need a gate? Which [[Approval Dossier]] panels?

## Tests
What must be impossible afterwards.

## Related
```
