-- ===========================================================================
-- 0010 — Mission hierarchy: parent/child missions for Operational Readiness
--
-- A system-level mission (Operational Readiness) needs business-scoped work
-- done inside every configured business' own context — never in a mission
-- with no business, and never by borrowing one business for all of them.
-- Fixed at the planner: a parent mission with no business and no tasks of
-- its own, one child mission per business (plus one for shared
-- infrastructure), each a completely ordinary, fully-isolated mission. This
-- column is the only schema change that fix needs — everything else (task
-- isolation, RLS, business scoping) already exists and applies unchanged.
--
-- Safe to run against a database carrying 0001–0009. Adds a column; changes
-- nothing that already exists.
-- ===========================================================================

alter table public.missions
  add column if not exists parent_mission_id uuid references public.missions (id) on delete cascade;

create index if not exists missions_parent_idx on public.missions (parent_mission_id);
