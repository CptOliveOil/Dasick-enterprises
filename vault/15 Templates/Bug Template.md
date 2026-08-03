---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: For every bug. Never delete one.
related:
tags:
  - template
---

# Bug Template
> [!note] For every bug. Never delete one.


```markdown
---
status: investigating   # investigating | resolved | wont-fix
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: fayaz
summary: One line — the observable failure
severity: high          # low | medium | high | critical
commit:
resolved:
related: []
tags: [bug]
---

# <Short descriptive name, not the error text>

> [!bug] Problem
> What the operator actually saw, in their words where possible.

## Symptoms
What was visible. Include the exact error string.

## Root cause
The real cause, not the first plausible one. If the symptom appeared several
steps from the cause, say so explicitly.

## Investigation
What was eliminated and how. This is often more useful than the fix.

## Fix
What changed, and what was deliberately *not* changed.

## Tests added
Which file, and how it was verified — revert the fix, watch it fail.

## Commit
`abc1234`

## Lessons learned
The pattern. This is the part that stops the next one.

## Related
- [[…]]
```
