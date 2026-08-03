---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - template
---

# Templates

```dataview
TABLE summary
FROM "15 Templates"
WHERE file.name != "Index"
SORT file.name ASC
```

Set the Templates plugin folder to `15 Templates`, then insert with `Ctrl+T`.

## Which one

| Writing about | Use |
| --- | --- |
| A system or pipeline | [[Architecture Template]] |
| Something that broke | [[Bug Template]] |
| A choice hard to reverse | [[Decision Template]] |
| A workflow definition | [[Workflow Template]] |
| An external service | [[Provider Template]] |
| An endpoint | [[API Template]] |
| A belief about the world | [[Research Template]] |
| Something to build | [[Feature Template]] |
| A working session | [[Meeting Notes]] |

A **table** page has no template — copy the closest existing one in
[[05 Database/Index|Tables]]; the shape is fixed and short.
