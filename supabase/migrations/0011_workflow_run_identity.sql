-- ===========================================================================
-- 0011 — workflow_runs can identify a built-in workflow without a fake row
--
-- Built-in workflows are code (`WORKFLOW_DEFINITIONS` in
-- lib/workflows/definitions.ts, resolved by `findWorkflow`), deliberately
-- never rows in `workflow_definitions` — see the comment in
-- lib/workspace/provision.ts explaining why provisioning writes none. That
-- was correct. But `workflow_runs.workflow_definition_id` was still
-- `not null references workflow_definitions(id)`, so the first mission built
-- from a built-in workflow against a real, FK-enforcing database failed:
--
--   workflow_runs: insert or update on table "workflow_runs" violates
--   foreign key constraint "workflow_runs_workflow_definition_id_fkey"
--
-- Fix: `workflow_definition_id` becomes nullable, kept only for a genuinely
-- custom (database-defined, owner-created) workflow, where it still
-- references a real row. `workflow_key` identifies a built-in instead — no
-- database row required, because none should ever exist for one.
--
-- No backfill: an existing run's `workflow_definition_id` (when it names a
-- built-in) is a deterministic hash of that workflow's key `stableId`
-- computes in application code, not something this migration can recompute
-- in SQL without re-implementing that hash. `resolveRunWorkflow()`
-- (lib/workflows/engine.ts) resolves those old rows by matching the id
-- against `WORKFLOW_DEFINITIONS` instead — every existing run stays
-- resolvable with no data migration needed.
--
-- Safe to run against a database carrying 0001–0010. Loosens a constraint
-- and adds a column; changes no existing row.
-- ===========================================================================

alter table public.workflow_runs
  add column if not exists workflow_key text;

alter table public.workflow_runs
  alter column workflow_definition_id drop not null;

-- Still a foreign key when set — a custom workflow's id must be real. Only
-- the `not null` half of the original constraint was ever the problem.
alter table public.workflow_runs
  drop constraint if exists workflow_runs_identifies_workflow;

alter table public.workflow_runs
  add constraint workflow_runs_identifies_workflow
  check (workflow_definition_id is not null or workflow_key is not null);

create index if not exists workflow_runs_workflow_key_idx on public.workflow_runs (workflow_key);
