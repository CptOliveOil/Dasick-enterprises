---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: workflow_runs kept a hard foreign key to a table built-in workflows deliberately never populate
severity: high
commit: 3eed32a
resolved: 2026-08
related:
  - [[workflow_runs]]
  - [[workflow_definitions]]
  - [[Workflow Engine]]
  - [[Mission Engine]]
  - [[Operational Readiness]]
tags:
  - bug
---

# Workflow Runs Referenced A Workflow That Was Never A Database Row

> [!bug] Problem
> A brand-new Operational Readiness mission failed with:
>
> ```
> workflow_runs: insert or update on table "workflow_runs" violates foreign
> key constraint "workflow_runs_workflow_definition_id_fkey"
> ```
>
> The failure was correct. Every built-in workflow's `id` is a deterministic,
> code-only hash (`stableId`, `lib/ids.ts`) — never a row in
> `workflow_definitions`, by a deliberate, documented, correct earlier
> decision (see `lib/workspace/provision.ts`). `workflow_runs.workflow_definition_id`
> was still `not null references workflow_definitions(id)`. The schema and
> the runtime had quietly stopped agreeing with each other.

## Symptoms

Any mission built from *any* built-in `workflowKey` — not only Operational
Readiness — fails the moment `createMission` tries to write its
`workflow_runs` row, against a real, foreign-key-enforcing database. The
mission and its tasks are already committed by that point (`createMission`
is not one transaction), so the failure leaves an orphaned mission with tasks
that were never run and no `workflow_runs` row at all.

## Root cause

Two correct decisions, made at different times, stopped being consistent
with each other:

1. Built-in workflows are code, resolved by `findWorkflow()` — the database
   table is never their source of truth, and writing rows for them during
   provisioning would only create drift. Correct, and unchanged by this fix.
2. `workflow_runs.workflow_definition_id` was declared `not null references
   workflow_definitions(id)` when the table was first designed, when every
   run's workflow — built-in or not — was assumed to be a database row.

Once (1) was decided, (2) was no longer true for the overwhelming majority of
missions, and nothing enforced or even noticed the mismatch — `MemoryStore`,
which every one of the 524 tests already in the suite runs against, does not
check foreign keys at all. The bug was invisible until the first mission ran
against a real, constrained Postgres database.

## Investigation

Traced the exact write: `createMission` (`lib/workflows/engine.ts`) resolves
`workflowKey` via `findWorkflow`, which only ever returns an in-code
`WorkflowDefinition` whose `id` is `stableId('workflow:' + key)` — confirmed
by reading `lib/workflows/definitions.ts` directly, not assumed. Confirmed no
code path anywhere inserts built-in rows into `workflow_definitions` —
`lib/db/seed.ts`'s insert is Demo Mode only; `lib/workspace/provision.ts`
explicitly documents *why* it inserts none for a real workspace. Confirmed
`missions.workflow_definition_id` has no foreign key at all (only
`workflow_runs`'s does), so this was never a problem for missions themselves
— only for the one `workflow_runs` row each mission's `createMission` call
writes.

Reproduced the exact reported error under test by extending
`RlsMemoryStore` (`tests/rls-store.ts`) — the test double that already
transcribes the real RLS policies from the migrations — with the one foreign
key `MemoryStore` cannot check: `workflow_runs.workflow_definition_id`, when
set, must name a row that exists. Running the existing "still runs a mission
afterwards, because workflows come from code" test
(`tests/real-mode.test.ts`) against the extended double reproduced the exact
reported message, from the exact real code path, before any fix was applied.

## Fix

Migration `0011_workflow_run_identity.sql`:

- `workflow_runs.workflow_definition_id` is now nullable.
- `workflow_runs.workflow_key` (text) added — the workflow's `key`, written
  regardless of whether it is built-in or custom.
- The `not null` constraint is replaced with `workflow_definition_id is not
  null or workflow_key is not null` — every run still identifies a workflow,
  just not necessarily through a foreign key.

`createMission` now writes `workflow_definition_id: null, workflow_key:
workflow.key` for a built-in, and `workflow_definition_id: <the real row's
id>, workflow_key: workflow.key` for a genuinely custom one — distinguished
by `WORKFLOW_DEFINITIONS.includes(workflow)`. Resolving a workflow key was
also extended (`resolveWorkflow()`) to check the database *after* the
built-in list, which — as a side effect — makes a genuinely custom,
operator-created workflow resolvable through `workflowKey` for the first
time; it never was before, since `findWorkflow` alone only ever searched the
in-code list.

`resolveRunWorkflow()` reads a run back the same way: `workflow_key` first,
then a real database row, then — for a run written before this migration,
which has no `workflow_key` and a `workflow_definition_id` that is a
built-in's code-only hash — a match against `WORKFLOW_DEFINITIONS` by id.
No backfill migration was needed or written: existing rows keep whatever
they already had, and resolve correctly through the fallback.

## Tests added

`tests/workflow-run-identity.test.ts` — six tests: the exact FK violation
reproduced verbatim against `RlsMemoryStore`; a built-in workflow mission
writing no fake row (and the same for both readiness children, the mission
that reported this in the first place); a custom database-defined workflow
keeping a real, FK-satisfying id; a retry leaving the `workflow_runs` row
untouched; and a pre-migration-shaped row still resolving with no backfill.

`tests/rls-store.ts` gained the foreign-key check itself — not invented for
the test, transcribed from the constraint the migration leaves in place, the
same way every other rule in that file is transcribed from a real policy.

## Commit

`3eed32a`

## Lessons learned

**A decision changing what's true doesn't automatically update everything
that assumed the old truth.** "Built-in workflows are code" was the right
call the day it was made. Nothing was wrong with it. What went unexamined
was everything written *before* that call that still assumed a workflow
always had a database row behind it — a `not null references` constraint two
migrations earlier that nobody revisited when the assumption underneath it
changed.

**A test double only guards against what it transcribes.** `RlsMemoryStore`
already existed, already caught the sibling bug in `provisionWorkspace`
(writing into the immutable shared workflow library), and would have caught
this one too — it just had never been asked to enforce a plain foreign key,
only Row Level Security. The fix was adding one check, not a new mechanism.

**`MemoryStore` passing 524 tests proved nothing about constraints it cannot
see.** Every test in this suite ran against an in-memory store with no
referential integrity at all. The bug was invisible until the first
real-database mission — exactly the gap `RlsMemoryStore` exists to close,
extended here to close it a second time, for a different class of rule.

## Related

- [[workflow_runs]]
- [[workflow_definitions]]
- [[Workflow Engine]]
- [[Mission Engine]]
- [[Operational Readiness]]
