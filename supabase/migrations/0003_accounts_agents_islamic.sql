-- ===========================================================================
-- Command Centre — migration 0003
--
-- Three things:
--   1. Owner profiles: role, timezone, avatar, updated_at.
--   2. Operator-created agents: type, memory access, template, archive.
--   3. Islamic content: research, source checks, per-channel source policy and
--      visual rules, and the optional channel profile fields.
--
-- Plus an RLS audit. Every table below is owner-scoped, and the existing tables
-- that were reachable only through a parent are tightened where the parent
-- relationship allowed a gap.
--
-- Safe to run against a database already carrying 0001 and 0002.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists role text not null default 'owner',
  add column if not exists timezone text not null default 'Europe/London',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('owner', 'admin', 'member', 'viewer'));
  end if;
end
$$;

-- A profile must never be able to promote itself. The `for all` policy from
-- 0001 allows a self-update, which would otherwise include `role`.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Roles cannot be changed from the client.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_is_immutable on public.profiles;
create trigger profiles_role_is_immutable
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Keep the sign-up trigger in step with the widened table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', 'Operator'),
    -- The first profile on a fresh project is the owner. Additional users, if
    -- team support is enabled later, are invited at a lower role.
    case when (select count(*) from public.profiles) = 0 then 'owner' else 'viewer' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Agents
-- ---------------------------------------------------------------------------

alter table public.agents
  add column if not exists agent_type text not null default 'custom',
  add column if not exists memory_access text not null default 'business',
  add column if not exists template_key text,
  add column if not exists is_custom boolean not null default false,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agents_type_check') then
    alter table public.agents add constraint agents_type_check check (
      agent_type in (
        'research','writer','reviewer','analyst','manager','production','finance','custom'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agents_memory_access_check') then
    alter table public.agents add constraint agents_memory_access_check
      check (memory_access in ('none', 'business', 'agent'));
  end if;
end
$$;

-- Slugs address agents in URLs and in the Commander's plans, so a collision
-- within one account would route work to the wrong planet.
create unique index if not exists agents_owner_slug_key
  on public.agents (owner_id, slug);

create index if not exists agents_archived_idx on public.agents (owner_id, archived_at);

-- ---------------------------------------------------------------------------
-- 3. Channel profile fields
--
-- All optional, all free text. Nothing here assumes a madhhab, a school or a
-- theological position — they record what the operator has chosen.
-- ---------------------------------------------------------------------------

alter table public.youtube_channels
  add column if not exists content_school_or_methodology_notes text not null default '',
  add column if not exists preferred_translation text not null default '',
  add column if not exists preferred_source_policy text not null default '',
  add column if not exists arabic_display_preferences text not null default '',
  add column if not exists religious_content_disclaimer text not null default '',
  add column if not exists visual_restrictions text not null default '';

-- ---------------------------------------------------------------------------
-- 4. Islamic research and verification
-- ---------------------------------------------------------------------------

create table if not exists public.islamic_research (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  idea_id uuid references public.youtube_ideas (id) on delete set null,
  topic text not null,
  summary text not null default '',
  audience text not null default '',
  content_goal text not null default '',
  -- Evidence is stored as jsonb rather than flattened into columns: a citation
  -- is only meaningful as a whole, and half a hadith reference is worse than
  -- none. Keeping each item intact also means a null stays a null.
  quran_evidence jsonb not null default '[]'::jsonb,
  hadith_evidence jsonb not null default '[]'::jsonb,
  scholarly_context jsonb not null default '[]'::jsonb,
  historical_context jsonb not null default '[]'::jsonb,
  key_points jsonb not null default '[]'::jsonb,
  areas_of_difference jsonb not null default '[]'::jsonb,
  sensitive_claims jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  verification_status text not null default 'unreviewed'
    check (verification_status in ('unreviewed', 'reviewed', 'blocked')),
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists islamic_research_business_idx
  on public.islamic_research (business_id, created_at desc);
create index if not exists islamic_research_mission_idx
  on public.islamic_research (mission_id);

create table if not exists public.islamic_source_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  research_id uuid references public.islamic_research (id) on delete set null,
  script_id uuid references public.youtube_scripts (id) on delete set null,
  video_id uuid references public.youtube_videos (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  subject text not null check (subject in ('research', 'script')),
  verdict text not null check (verdict in ('pass', 'pass_with_notes', 'blocked')),
  summary text not null default '',
  findings jsonb not null default '[]'::jsonb,
  outstanding jsonb not null default '[]'::jsonb,
  policy_violations jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists islamic_source_checks_business_idx
  on public.islamic_source_checks (business_id, created_at desc);
create index if not exists islamic_source_checks_script_idx
  on public.islamic_source_checks (script_id);

-- ---------------------------------------------------------------------------
-- 5. Per-channel policy
-- ---------------------------------------------------------------------------

create table if not exists public.source_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  methodology_notes text not null default '',
  preferred_translation text not null default '',
  source_policy_notes text not null default '',
  arabic_display text not null default 'arabic_with_translation'
    check (arabic_display in ('none', 'arabic_only', 'arabic_with_translation', 'translation_only')),
  religious_disclaimer text not null default '',
  require_quran_reference boolean not null default true,
  require_hadith_grading boolean not null default true,
  require_source_check_before_script_approval boolean not null default true,
  weak_hadith_policy text not null default 'labelled'
    check (weak_hadith_policy in ('never', 'labelled', 'allowed')),
  require_difference_labelling boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists source_policies_business_key
  on public.source_policies (business_id);

create table if not exists public.visual_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  no_prophet_depiction boolean not null default true,
  no_divine_depiction boolean not null default true,
  no_generated_sacred_text boolean not null default true,
  require_calligraphy_approval boolean not null default true,
  human_depiction text not null default 'faceless'
    check (human_depiction in ('none', 'faceless', 'allowed')),
  background_music text not null default 'none'
    check (background_music in ('none', 'ambient_only', 'allowed')),
  extra_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists visual_rules_business_key
  on public.visual_rules (business_id);

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.islamic_research enable row level security;
alter table public.islamic_source_checks enable row level security;
alter table public.source_policies enable row level security;
alter table public.visual_rules enable row level security;

-- Owner-scoped directly.
do $$
declare
  t text;
begin
  foreach t in array array['source_policies', 'visual_rules']
  loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t
    ) then
      execute format(
        'create policy "owner access" on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',
        t
      );
    end if;
  end loop;
end
$$;

-- Scoped through the parent business.
do $$
declare
  t text;
begin
  foreach t in array array['islamic_research', 'islamic_source_checks']
  loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t
    ) then
      execute format($f$
        create policy "owner access via business" on public.%I for all
        using (exists (
          select 1 from public.businesses b
          where b.id = %I.business_id and b.owner_id = auth.uid()
        ))
        with check (exists (
          select 1 from public.businesses b
          where b.id = %I.business_id and b.owner_id = auth.uid()
        ))
      $f$, t, t, t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS audit of existing tables
--
-- Two gaps found in the 0001/0002 policies, both harmless while there is one
-- account and both worth closing before there is more than one.
-- ---------------------------------------------------------------------------

-- (a) agent_memory was scoped through its agent, so a row could name any
--     business_id — including one belonging to another account. Memory is the
--     one table where a leak crosses straight into another agent's prompt.
drop policy if exists "owner access via agent" on public.agent_memory;
create policy "owner access via agent" on public.agent_memory for all
  using (
    exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
    and (
      business_id is null
      or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
    )
  )
  with check (
    exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
    and (
      business_id is null
      or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
    )
  );

-- (b) task_dependencies checked only `task_id`. `depends_on_task_id` was
--     unchecked, so a dependency could be pointed at another account's task.
drop policy if exists "owner access via task" on public.task_dependencies;
create policy "owner access via task" on public.task_dependencies for all
  using (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
    and exists (
      select 1 from public.tasks t where t.id = depends_on_task_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
    and exists (
      select 1 from public.tasks t where t.id = depends_on_task_id and t.owner_id = auth.uid()
    )
  );

-- (c) Built-in workflow definitions (owner_id is null) are readable by any
--     signed-in user, which is intended — they are library data, not content.
--     But the writable policy used `for all`, which grants INSERT/UPDATE/DELETE
--     on rows where `auth.uid() = owner_id`; a row with a null owner matches
--     neither policy for writes, so the library is already immutable. Recreated
--     explicitly so that stays true rather than being an accident of null
--     comparison.
drop policy if exists "own workflows are writable" on public.workflow_definitions;
create policy "own workflows are insertable" on public.workflow_definitions
  for insert with check (owner_id is not null and auth.uid() = owner_id);
create policy "own workflows are updatable" on public.workflow_definitions
  for update using (owner_id is not null and auth.uid() = owner_id)
  with check (owner_id is not null and auth.uid() = owner_id);
create policy "own workflows are deletable" on public.workflow_definitions
  for delete using (owner_id is not null and auth.uid() = owner_id);
