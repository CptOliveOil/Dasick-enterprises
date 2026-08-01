-- ===========================================================================
-- 0007 — Business Intelligence Memory
--
-- One row per completed mission: what it was about, what it cost, and — once
-- real analytics exist — how it actually performed. Agents read this back so
-- that a business gets better at its own work rather than starting from zero
-- every time.
--
-- Every performance column is nullable on purpose. A mission completing is not
-- an audience watching. Nulls stay null until a real analytics row fills them,
-- because a workspace that seeds plausible numbers teaches its own agents to
-- be confident about figures nobody measured.
--
-- Safe to run against a database carrying 0001–0006. Adds one table; changes
-- nothing that already exists.
-- ===========================================================================

create table if not exists public.mission_outcomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  -- The mission may be deleted without taking the lesson with it.
  mission_id uuid references public.missions (id) on delete set null,

  topic text not null,
  category text not null default 'general',
  business_kind text not null default 'general',
  entity_kind text,
  entity_id uuid,
  published_at timestamptz,

  -- Audience.
  views integer,
  impressions integer,
  ctr numeric(6, 4),
  thumbnail_ctr numeric(6, 4),
  watch_time_minutes numeric(12, 2),
  average_view_percentage numeric(6, 4),
  comments integer,

  -- Commerce.
  units_sold integer,
  conversion_rate numeric(6, 4),
  revenue numeric(12, 2),
  rpm numeric(10, 2),

  -- Cost of production, known the moment the mission ends.
  ai_cost numeric(12, 4) not null default 0,
  minutes_taken numeric(10, 2),
  difficulty integer,
  success_score integer,

  notes jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One outcome per mission. Re-recording the same completion must update the
-- row rather than add a second one, or the same video would be counted twice
-- in every average the agents read.
create unique index if not exists mission_outcomes_mission_idx
  on public.mission_outcomes (mission_id)
  where mission_id is not null;

-- The two reads that matter: a business's own history, newest first, and
-- looking an outcome up by what it produced when analytics arrive.
create index if not exists mission_outcomes_business_idx
  on public.mission_outcomes (business_id, created_at desc);

create index if not exists mission_outcomes_entity_idx
  on public.mission_outcomes (entity_id)
  where entity_id is not null;

alter table public.mission_outcomes enable row level security;

-- Owner-scoped, matching every other table that carries owner_id directly.
-- One account's learned history must never reach another's prompts.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mission_outcomes'
  ) then
    create policy "owner access" on public.mission_outcomes for all
      using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end
$$;
