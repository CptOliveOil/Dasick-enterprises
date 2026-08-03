---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
tags:
  - index
  - database
---

# Tables

```dataview
TABLE scope, migration, summary
FROM "05 Database"
WHERE file.name != "Index"
SORT file.name ASC
```

## Scope legend

| Scope | Policy |
| --- | --- |
| owner-only | `auth.uid() = owner_id`, and only the owner role may write |
| owner-scoped | `auth.uid() = owner_id` |
| business-scoped | ownership resolved through `businesses` |
| via agent / via task | resolved through the parent row |
| read-only for shared rows | ownerless rows are the built-in library |

See [[Row Level Security]] and [[Migrations]].

> [!tip] Adding a table
> Add it to `Tables` in `lib/db/tables.ts`, to `TABLE_NAMES`, to
> `tests/rls-store.ts`, and write a new numbered migration. The RLS test double
> **fails loudly for any untranscribed table**, which is deliberate.
