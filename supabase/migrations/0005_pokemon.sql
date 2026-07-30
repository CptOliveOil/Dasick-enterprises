-- ===========================================================================
-- Command Centre — migration 0005
--
-- The Pokémon Researcher's output: one table for content opportunities,
-- whether they are for YouTube, the trading card game, or product research.
--
-- One table rather than three because all three are the same thing — an
-- opportunity the operator can act on — differing only in which specialisation
-- columns are filled in. Keeping them together means one ranked list instead of
-- three, and one place to add the next kind.
--
-- Safe to run against a database carrying 0001–0004.
-- ===========================================================================

create table if not exists public.pokemon_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,

  kind text not null check (kind in ('youtube', 'tcg', 'etsy')),

  title_concept text not null,
  hook text not null,
  category text not null,
  why_watch text not null,
  target_audience text not null,
  suggested_minutes integer not null default 12,
  research_required jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0.5,
  -- Never inferred from the topic. An operator deciding what to make this week
  -- needs to know which of these keep and which expire.
  lifespan text not null default 'evergreen' check (lifespan in ('evergreen', 'trend_driven')),

  -- Trading card specialisation.
  tcg_focus text,
  -- True when the topic cannot be stated as fact without a source nothing here
  -- is connected to: current prices, market movement, graded populations.
  requires_live_data boolean not null default false,
  live_data_needed jsonb not null default '[]'::jsonb,

  -- Product specialisation. `ip_risk` is recomputed from the concept text by
  -- lib/pokemon/policy.ts rather than taken from the model, because the case
  -- worth catching is the one where the model judged it wrong.
  ip_risk text check (ip_risk in ('none', 'low', 'medium', 'high', 'blocked')),
  ip_concerns jsonb not null default '[]'::jsonb,
  safe_direction text,

  sources jsonb not null default '[]'::jsonb,
  notes text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  -- True when the row came from the simulated provider. Kept in the data, not
  -- only in the text, so a row that is later exported or counted stays labelled.
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pokemon_opportunities_owner_idx
  on public.pokemon_opportunities (owner_id, created_at desc);
create index if not exists pokemon_opportunities_kind_idx
  on public.pokemon_opportunities (owner_id, kind, status);
create index if not exists pokemon_opportunities_mission_idx
  on public.pokemon_opportunities (mission_id);
-- The two rows an operator goes looking for: what is blocked on a data source,
-- and what is blocked on a licence.
create index if not exists pokemon_opportunities_live_data_idx
  on public.pokemon_opportunities (owner_id) where requires_live_data;
create index if not exists pokemon_opportunities_ip_idx
  on public.pokemon_opportunities (owner_id, ip_risk)
  where ip_risk in ('high', 'blocked');

alter table public.pokemon_opportunities enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pokemon_opportunities'
  ) then
    create policy "owner access" on public.pokemon_opportunities for all
      using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end
$$;
