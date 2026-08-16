---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The shared workflow library. Built-ins are code, never a row here.
migration: '0001, immutability in 0003'
scope: read-only for shared rows
related:
  - [[Workflow Engine]]
  - [[RLS Blocks Workspace Provisioning]]
  - [[workflow_runs]]
  - [[Workflow Runs Referenced A Workflow That Was Never A Database Row]]
tags:
  - table
  - database
---

# workflow_definitions

> [!info] Purpose
> The shared workflow library, for genuinely operator-created custom
> workflows. Built-in workflows are never a row here — they are code
> (`WORKFLOW_DEFINITIONS`, `lib/workflows/definitions.ts`) — and a row here
> claiming to be one was exactly the bug in
> [[Workflow Runs Referenced A Workflow That Was Never A Database Row]].

## Key columns

`owner_id` (null for the — unused, immutable — built-in shape; always set for
a real custom row), `key`, `name`, `steps`

## Relationships

Ownerless rows would be the built-in library, are deliberately immutable
(migration `0003`), and provisioning writes none — see
`lib/workspace/provision.ts`. `[[workflow_runs]].workflow_definition_id`
references a row here only for a genuinely custom workflow.

## Indexes

—

## Row Level Security

**read-only for shared rows** — see [[Row Level Security]].

## Used by

`resolveWorkflow()` (`lib/workflows/engine.ts`) — checked only after the
built-in list (`findWorkflow`) misses, so a custom workflow needs a matching
`key` an operator's own row supplies. No product surface writes one yet; the
resolution path exists, the authoring UI does not.

## Migration history

`0001`, immutability in `0003`.

## Related

- [[Workflow Engine]]
- [[RLS Blocks Workspace Provisioning]]
- [[workflow_runs]]
- [[Workflow Runs Referenced A Workflow That Was Never A Database Row]]
