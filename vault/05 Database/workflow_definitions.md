---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The shared workflow library. **Never read at runtime.**
migration: `0001`, immutability in `0003`
scope: read-only for shared rows
related:
  - [[Workflow Engine]]
  - [[RLS Blocks Workspace Provisioning]]
tags:
  - table
  - database
---

# workflow_definitions

> [!info] Purpose
> The shared workflow library. **Never read at runtime.**

## Key columns

`owner_id` (null for built-ins), `key`, `name`, `steps`

## Relationships

Ownerless rows are the built-in library and are deliberately immutable.

## Indexes

—

## Row Level Security

**read-only for shared rows** — see [[Row Level Security]].

## Used by

Nothing at runtime — built-ins live in code

## Migration history

`0001`, immutability in `0003`

## Related

- [[Workflow Engine]]
- [[RLS Blocks Workspace Provisioning]]
