---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - workflow
---

# Workflows

```dataview
TABLE key, summary
FROM "06 Workflows"
WHERE file.name != "Index"
SORT file.name ASC
```

> [!important] One definition per job
> There is no demo variant and no production variant. Demo and Production build
> an **identical** task graph — same steps, same order, same dependencies, same
> gates. `tests/modes.test.ts` asserts it with `toEqual`, and also asserts that
> no definition anywhere names a vendor. See [[Mode System]] and
> [[One Workflow Not Two]].
