-- ===========================================================================
-- Command Centre — migration 0006
--
-- The account-level AI spending ceiling.
--
-- Separate from `production_budgets`, which caps what one video may cost in
-- media providers. This caps what the whole workforce may spend on model calls
-- in a calendar month, and it is the control that stands between an operator
-- and a surprise invoice.
--
-- There is deliberately no default row and no default figure. Until the owner
-- inserts one and sets `activated_at`, no paid model call runs at all — a limit
-- nobody chose is not a limit, and a number invented on the operator's behalf
-- would be spending their money on an assumption.
--
-- Safe to run against a database carrying 0001–0005.
-- ===========================================================================

create table if not exists public.ai_budgets (
  id uuid primary key default gen_random_uuid(),
  -- One budget per account. The unique constraint is what stops a second row
  -- quietly becoming a second, higher ceiling.
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  currency text not null default 'GBP',

  -- Hard stop. Month-to-date spend at or above this runs nothing further, and
  -- no approval overrides it.
  monthly_ceiling numeric not null check (monthly_ceiling >= 0),
  -- Where warnings begin, as a percentage of the ceiling.
  warn_at_percent integer not null default 80 check (warn_at_percent between 1 and 100),
  -- Most one mission may spend before it stops for the operator.
  per_mission_ceiling numeric not null check (per_mission_ceiling >= 0),
  -- A single step estimated at or above this stops for explicit approval.
  approval_over numeric not null check (approval_over >= 0),

  -- Null until the owner deliberately turns paid execution on.
  activated_at timestamptz,
  -- Always a profile, never an agent. See the policy below.
  updated_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_budgets enable row level security;

-- Owner-only, in both directions. Combined with the application route, which
-- also checks the `owner` role, this is what makes "an agent cannot raise its
-- own ceiling" a property of the database rather than a promise in a prompt:
-- an agent runs inside a task, has no session of its own, and every write here
-- is attributable to a signed-in person.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_budgets'
  ) then
    create policy "owner access" on public.ai_budgets for all
      using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end
$$;

-- Month-to-date spend is read on every model call, so the index that answers it
-- matters more than the others in this file.
create index if not exists api_usage_month_idx
  on public.api_usage (owner_id, created_at desc);
create index if not exists api_usage_task_idx
  on public.api_usage (task_id);
