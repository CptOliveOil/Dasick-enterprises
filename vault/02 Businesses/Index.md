---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - business
---

# Businesses

```dataview
TABLE status, summary
FROM "02 Businesses"
WHERE file.name != "Index"
SORT status ASC
```

A business scopes agents, memory, records and RLS. Two channels under one
account never see each other's memory — see [[Business Memory]].
