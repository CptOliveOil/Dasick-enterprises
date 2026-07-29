-- ===========================================================================
-- Command Centre — migration 0004
--
-- The daily operating layer:
--   1. Mission priority and optional deadlines.
--   2. Memory provenance, status and pinning — the memory approval gate.
--   3. Source resolutions: the NEEDS_SOURCE gate and its override audit trail.
--   4. Two new approval kinds.
--
-- Safe to run against a database carrying 0001–0003.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Missions
-- ---------------------------------------------------------------------------

alter table public.missions
  add column if not exists priority text not null default 'normal',
  -- Deadlines are never inferred. A null here means nobody asked for one.
  add column if not exists target_date date,
  add column if not exists target_time text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'missions_priority_check') then
    alter table public.missions add constraint missions_priority_check
      check (priority in ('low', 'normal', 'high', 'critical'));
  end if;
end
$$;

create index if not exists missions_priority_idx
  on public.missions (owner_id, priority) where priority in ('high', 'critical');
create index if not exists missions_target_date_idx
  on public.missions (owner_id, target_date) where target_date is not null;

-- ---------------------------------------------------------------------------
-- 2. Agent memory
--
-- `origin` is the load-bearing column: an agent-written rule and an
-- operator-written rule read identically in a prompt but mean very different
-- things when tracing why an agent behaved as it did.
--
-- `status = 'pending'` is what the memory approval gate hangs on. Pending rows
-- are never loaded into a run — that is enforced in loadRelevantMemory, and it
-- is the entire point of the gate.
-- ---------------------------------------------------------------------------

alter table public.agent_memory
  add column if not exists origin text not null default 'agent',
  add column if not exists status text not null default 'active',
  add column if not exists pinned boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_memory_origin_check') then
    alter table public.agent_memory add constraint agent_memory_origin_check
      check (origin in ('agent', 'owner'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agent_memory_status_check') then
    alter table public.agent_memory add constraint agent_memory_status_check
      check (status in ('active', 'pending', 'archived'));
  end if;
end
$$;

create index if not exists agent_memory_active_idx
  on public.agent_memory (agent_id, status, pinned desc, importance desc);

-- ---------------------------------------------------------------------------
-- 3. Source resolutions
--
-- Kept as its own table rather than living inside the approval payload,
-- because the outcome has to outlive the approval: the final quality check
-- needs to say which claims were overridden months later, when the approval is
-- long resolved.
-- ---------------------------------------------------------------------------

create table if not exists public.source_resolutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  source_check_id uuid references public.islamic_source_checks (id) on delete set null,
  script_id uuid references public.youtube_scripts (id) on delete set null,
  video_id uuid references public.youtube_videos (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  approval_id uuid references public.approvals (id) on delete set null,
  -- Each item carries its own status, action, resolver and timestamp. Stored as
  -- jsonb because a claim and its resolution are only meaningful together.
  items jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_resolutions_open_idx
  on public.source_resolutions (owner_id, status) where status = 'open';
create index if not exists source_resolutions_video_idx
  on public.source_resolutions (video_id);
create index if not exists source_resolutions_script_idx
  on public.source_resolutions (script_id);

alter table public.source_resolutions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'source_resolutions'
  ) then
    create policy "owner access" on public.source_resolutions for all
      using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Approval kinds
--
-- `source` is the NEEDS_SOURCE resolution gate; `memory` is a durable rule an
-- agent wants to keep. Both are ordinary approvals, so they inherit the
-- existing RLS, history and inbox behaviour for free.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'approvals_kind_check') then
    alter table public.approvals drop constraint approvals_kind_check;
  end if;
  alter table public.approvals add constraint approvals_kind_check check (
    kind in (
      'idea', 'research', 'script', 'thumbnail', 'video', 'product',
      'listing', 'spend', 'publish', 'source', 'memory', 'generic'
    )
  );
end
$$;
