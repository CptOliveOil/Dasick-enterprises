---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - agent
---

# Agents

An agent is a row: a name, a business, an authority level and a list of
capability strings. Adding one changes no code in the [[Agent Engine]].

```dataview
TABLE summary
FROM "03 Agents"
WHERE file.name != "Index"
SORT file.name ASC
```

## Authority levels

| Level | Means |
| --- | --- |
| 1 | Produces work; raises approvals; no external spend beyond model calls |
| 2 | May spend on media providers |
| 3 | May act irreversibly — publishing |

See [[Authority Model]] and [[Budget System]].
