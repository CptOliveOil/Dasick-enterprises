---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - architecture
---

# Index of Systems

Every architectural page, with what it is responsible for.

```dataview
TABLE status, summary AS "Responsible for"
FROM "01 Architecture"
SORT file.name ASC
```

## By concern

- **Orchestration** — [[Mission Engine]], [[Workflow Engine]], [[Task Graph]], [[Agent Engine]], [[Retry Engine]]
- **Integration** — [[Provider Layer]], [[Mode System]], [[Media Pipeline]], [[Rendering Pipeline]]
- **Governance** — [[Approval System]], [[Budget System]], [[Authority Model]], [[Copyright Review]]
- **Knowledge** — [[Business Memory]], [[Agent Memory]]
- **Platform** — [[Database]], [[Supabase]], [[Row Level Security]], [[Storage]], [[Authentication]], [[Security]]
- **Surface** — [[Galaxy]], [[Notifications]], [[Analytics]]
