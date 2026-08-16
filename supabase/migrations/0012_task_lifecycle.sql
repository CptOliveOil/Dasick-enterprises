-- ===========================================================================
-- 0012 — Task lifecycle: claim, heartbeat, and bounded stale-task recovery
--
-- There is no background worker in this system — every task runs
-- synchronously inside whatever request calls `runAgent`/`runMission`
-- (an operator command, an approval, a scheduled retry click). Nothing
-- persisted whether a task that reached `running` was still genuinely being
-- worked or had been orphaned by a crashed process or a dev-server restart,
-- so an orphaned task stayed `running` — and its mission read as "in
-- progress" — forever, with no way to tell the difference from real work
-- short of manually inspecting the row.
--
-- Adds the columns `reclaimStaleTasks()` (lib/workflows/reclaim.ts) needs to
-- tell "genuinely still within its expected window" from "stale": when a
-- task was claimed, when it last showed a sign of life, and how many times
-- it has already been reclaimed (bounded, so a task that keeps dying the
-- same way ends in `failed` rather than being reclaimed forever).
--
-- Safe to run against a database carrying 0001–0011. Adds columns only;
-- changes no existing row, and every new column is nullable or defaulted.
-- ===========================================================================

alter table public.tasks
  add column if not exists claimed_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists reclaim_count integer not null default 0;

create index if not exists tasks_stale_idx on public.tasks (heartbeat_at)
  where status = 'running';
