---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: For a system, subsystem or pipeline
related:
tags:
  - template
---

# Architecture Template
> [!note] For a system, subsystem or pipeline


Copy everything below into `01 Architecture/<Name>.md`.

---

```markdown
---
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
owner: fayaz
summary: One line — what this is responsible for
related: []
tags: [architecture]
---

# <Name>

> [!info] Purpose
> One paragraph. What would be missing if this did not exist?

**Code** — `path/to/file.ts`

## Responsibilities
- …

## Inputs
- …

## Outputs
- …

## Dependencies
- [[Other System]]

## Failure modes
- **What goes wrong** → what happens, and why it was designed that way.

## Future improvements
- …

## Related
- [[…]]
```
