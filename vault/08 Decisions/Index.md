---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - decision
---

# Decisions

Architecture Decision Records. One page per decision that would be expensive to
reverse or surprising to encounter.

```dataview
TABLE adr AS "#", status, decided, summary
FROM "08 Decisions"
WHERE file.name != "Index"
SORT adr ASC
```

> [!tip] When to write one
> If someone six months from now would ask "why on earth is it done that way?",
> the answer belongs here rather than in a code comment. Use
> [[Decision Template]].
