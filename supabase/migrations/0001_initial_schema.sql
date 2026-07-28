-- Command Centre — initial schema.
--
-- Column names match `types/domain.ts` one for one so the Supabase driver in
-- lib/db/supabase-store.ts needs no mapping layer. Nested structures are JSONB.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default 'Operator',
  currency text not null default 'GBP',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Businesses
-- ---------------------------------------------------------------------------

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  kind text not null check (kind in ('youtube', 'etsy', 'apps', 'generic')),
  description text not null default '',
  colour text not null default '#f5a524',
  currency text not null default 'GBP',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index if not exists businesses_owner_idx on public.businesses (owner_id);

-- ---------------------------------------------------------------------------
-- Agents
-- ---------------------------------------------------------------------------

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  name text not null,
  slug text not null,
  role text not null default '',
  description text not null default '',
  system_prompt text not null default '',
  provider text not null default 'anthropic',
  model text not null default 'claude-sonnet-4-5',
  temperature double precision not null default 0.7,
  max_tokens integer not null default 4096,
  status text not null default 'idle'
    check (status in ('idle','working','waiting','needs_approval','error','offline','disabled')),
  authority_level smallint not null default 1 check (authority_level between 0 and 4),
  current_task_id uuid,
  capabilities text[] not null default '{}',
  visual jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  tasks_completed integer not null default 0,
  tasks_failed integer not null default 0,
  average_execution_time integer not null default 0,
  estimated_total_cost double precision not null default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index if not exists agents_owner_idx on public.agents (owner_id);
create index if not exists agents_business_idx on public.agents (business_id);
create index if not exists agents_status_idx on public.agents (owner_id, status);

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  type text not null check (type in ('insight','preference','fact','constraint','performance')),
  content text not null,
  importance smallint not null default 3 check (importance between 1 and 5),
  source text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists agent_memory_agent_idx on public.agent_memory (agent_id, importance desc);

-- ---------------------------------------------------------------------------
-- Missions, tasks, workflows
-- ---------------------------------------------------------------------------

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  number integer not null,
  title text not null,
  objective text not null default '',
  status text not null default 'planning'
    check (status in ('planning','running','waiting','needs_approval','completed','failed','cancelled')),
  workflow_definition_id uuid,
  context jsonb not null default '{}'::jsonb,
  progress integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (owner_id, number)
);

create index if not exists missions_owner_idx on public.missions (owner_id, created_at desc);
create index if not exists missions_status_idx on public.missions (owner_id, status);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  step_key text,
  title text not null,
  description text not null default '',
  status text not null default 'queued'
    check (status in ('queued','running','waiting','approval','completed','failed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  progress integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz
);

create index if not exists tasks_owner_idx on public.tasks (owner_id, created_at desc);
create index if not exists tasks_mission_idx on public.tasks (mission_id);
create index if not exists tasks_agent_idx on public.tasks (agent_id, status);

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks (id) on delete cascade,
  unique (task_id, depends_on_task_id)
);

create index if not exists task_dependencies_task_idx on public.task_dependencies (task_id);

create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  key text not null,
  name text not null,
  description text not null default '',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  workflow_definition_id uuid not null references public.workflow_definitions (id) on delete cascade,
  status text not null default 'planning',
  step_tasks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_runs_mission_idx on public.workflow_runs (mission_id);

-- ---------------------------------------------------------------------------
-- Approvals, activity, notifications, chat
-- ---------------------------------------------------------------------------

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  mission_id uuid references public.missions (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  kind text not null default 'generic',
  title text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','changes_requested')),
  feedback text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists approvals_owner_idx on public.approvals (owner_id, status, created_at desc);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  mission_id uuid references public.missions (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  target_agent_id uuid references public.agents (id) on delete set null,
  kind text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_owner_idx on public.activity_logs (owner_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_owner_idx on public.notifications (owner_id, read, created_at desc);

create table if not exists public.command_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user','manager','system')),
  content text not null,
  mission_id uuid references public.missions (id) on delete set null,
  refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists command_messages_owner_idx on public.command_messages (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- YouTube module
-- ---------------------------------------------------------------------------

create table if not exists public.youtube_channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  handle text not null default '',
  niche text not null default '',
  target_audience text not null default '',
  external_id text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.youtube_ideas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  title text not null,
  topic text not null default '',
  niche text not null default '',
  summary text not null default '',
  target_audience text not null default '',
  why_it_might_work text not null default '',
  competition text not null default '',
  demand text not null default '',
  monetisation text not null default '',
  longevity text not null default '',
  click_potential text not null default '',
  difficulty text not null default '',
  confidence double precision not null default 0,
  sources text[] not null default '{}',
  notes text not null default '',
  score integer not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','saved')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists youtube_ideas_business_idx on public.youtube_ideas (business_id, score desc);

create table if not exists public.youtube_research (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  idea_id uuid references public.youtube_ideas (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  overview text not null default '',
  facts jsonb not null default '[]'::jsonb,
  statistics jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  viewer_questions jsonb not null default '[]'::jsonb,
  competitor_coverage jsonb not null default '[]'::jsonb,
  content_gaps jsonb not null default '[]'::jsonb,
  hooks jsonb not null default '[]'::jsonb,
  interesting_details jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  uncertain_claims jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.youtube_scripts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  idea_id uuid references public.youtube_ideas (id) on delete set null,
  research_id uuid references public.youtube_research (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  title text not null,
  sections jsonb not null default '[]'::jsonb,
  word_count integer not null default 0,
  estimated_duration_seconds integer not null default 0,
  tone text not null default '',
  audience text not null default '',
  goal text not null default '',
  status text not null default 'draft'
    check (status in ('draft','fact_checking','awaiting_approval','approved','rejected')),
  version integer not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_scripts_business_idx on public.youtube_scripts (business_id, updated_at desc);

create table if not exists public.youtube_script_versions (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.youtube_scripts (id) on delete cascade,
  version integer not null,
  sections jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (script_id, version)
);

create table if not exists public.youtube_fact_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  script_id uuid references public.youtube_scripts (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  findings jsonb not null default '[]'::jsonb,
  passed boolean not null default false,
  summary text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  idea_id uuid references public.youtube_ideas (id) on delete set null,
  script_id uuid references public.youtube_scripts (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  number integer not null,
  title text not null,
  status text not null default 'idea',
  alternative_titles text[] not null default '{}',
  selected_thumbnail_id uuid,
  publish_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_videos_business_idx on public.youtube_videos (business_id, number desc);

create table if not exists public.youtube_scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.youtube_videos (id) on delete cascade,
  scene_number integer not null,
  duration_seconds double precision not null default 0,
  narration text not null default '',
  visual_direction text not null default '',
  b_roll_query text not null default '',
  image_prompt text not null default '',
  video_prompt text not null default '',
  on_screen_text text not null default '',
  transition text not null default 'cut',
  asset_status text not null default 'pending'
    check (asset_status in ('pending','requested','ready','failed')),
  is_demo boolean not null default false
);

create index if not exists youtube_scenes_video_idx on public.youtube_scenes (video_id, scene_number);

create table if not exists public.youtube_thumbnail_concepts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  script_id uuid references public.youtube_scripts (id) on delete set null,
  visual_description text not null default '',
  subject text not null default '',
  background text not null default '',
  composition text not null default '',
  text text not null default '',
  emotion text not null default '',
  colour_direction text not null default '',
  reasoning text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.youtube_analytics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  date date not null,
  views integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  watch_time_minutes integer not null default 0,
  average_view_duration_seconds integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  subscribers_gained integer not null default 0,
  revenue double precision not null default 0,
  is_demo boolean not null default false
);

create index if not exists youtube_analytics_business_idx on public.youtube_analytics (business_id, date desc);

create table if not exists public.youtube_channel_intelligence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  best_topics jsonb not null default '[]'::jsonb,
  best_title_structures jsonb not null default '[]'::jsonb,
  thumbnail_patterns jsonb not null default '[]'::jsonb,
  ideal_duration text not null default '',
  retention_trends jsonb not null default '[]'::jsonb,
  best_publishing_periods jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  is_demo boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Etsy module
-- ---------------------------------------------------------------------------

create table if not exists public.etsy_stores (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  url text not null default '',
  niche text not null default '',
  external_id text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.etsy_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.etsy_stores (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  product text not null,
  target_customer text not null default '',
  problem text not null default '',
  demand text not null default '',
  competition text not null default '',
  pricing_range text not null default '',
  seasonality text not null default '',
  production_difficulty text not null default '',
  seo_opportunity text not null default '',
  market_gap text not null default '',
  profit_potential text not null default '',
  score integer not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','saved')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists etsy_opportunities_business_idx on public.etsy_opportunities (business_id, score desc);

create table if not exists public.etsy_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.etsy_stores (id) on delete set null,
  opportunity_id uuid references public.etsy_opportunities (id) on delete set null,
  name text not null,
  description text not null default '',
  target_buyer text not null default '',
  category text not null default '',
  assets_required jsonb not null default '[]'::jsonb,
  production_checklist jsonb not null default '[]'::jsonb,
  price double precision not null default 0,
  estimated_cost double precision not null default 0,
  status text not null default 'idea',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.etsy_listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.etsy_products (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  title text not null,
  description text not null default '',
  tags text[] not null default '{}',
  keywords text[] not null default '{}',
  category_suggestions text[] not null default '{}',
  price_suggestion double precision not null default 0,
  benefits jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  image_brief text not null default '',
  status text not null default 'draft'
    check (status in ('draft','awaiting_approval','approved','published')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.etsy_keywords (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  keyword text not null,
  search_volume text not null default '',
  competition text not null default '',
  relevance double precision not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.etsy_analytics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_id uuid references public.etsy_stores (id) on delete set null,
  date date not null,
  visits integer not null default 0,
  orders integer not null default 0,
  revenue double precision not null default 0,
  conversion_rate double precision not null default 0,
  is_demo boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  kind text not null check (kind in ('revenue','expense','ai_cost','subscription')),
  category text not null default '',
  description text not null default '',
  amount double precision not null default 0,
  currency text not null default 'GBP',
  occurred_at timestamptz not null default now(),
  reference_type text,
  reference_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists financial_transactions_owner_idx
  on public.financial_transactions (owner_id, occurred_at desc);

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  provider text not null default 'anthropic',
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost double precision not null default 0,
  duration_ms integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_owner_idx on public.api_usage (owner_id, created_at desc);
create index if not exists api_usage_agent_idx on public.api_usage (agent_id);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  provider text not null,
  label text not null default '',
  -- Advisory only. The application derives real connection state from whether
  -- the required server environment variables are present.
  connected boolean not null default false,
  required_env text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Every table is readable and writable only by its owner. Child tables that
-- have no owner_id of their own inherit it through their parent business or
-- parent record, so a business can never leak across accounts.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.agents enable row level security;
alter table public.agent_memory enable row level security;
alter table public.missions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.workflow_definitions enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.command_messages enable row level security;
alter table public.youtube_channels enable row level security;
alter table public.youtube_ideas enable row level security;
alter table public.youtube_research enable row level security;
alter table public.youtube_scripts enable row level security;
alter table public.youtube_script_versions enable row level security;
alter table public.youtube_fact_checks enable row level security;
alter table public.youtube_videos enable row level security;
alter table public.youtube_scenes enable row level security;
alter table public.youtube_thumbnail_concepts enable row level security;
alter table public.youtube_analytics enable row level security;
alter table public.youtube_channel_intelligence enable row level security;
alter table public.etsy_stores enable row level security;
alter table public.etsy_opportunities enable row level security;
alter table public.etsy_products enable row level security;
alter table public.etsy_listings enable row level security;
alter table public.etsy_keywords enable row level security;
alter table public.etsy_analytics enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.api_usage enable row level security;
alter table public.integration_connections enable row level security;

create policy "profiles are self-owned" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Tables that carry owner_id directly.
do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses','agents','missions','tasks','approvals','activity_logs',
    'notifications','command_messages','financial_transactions','api_usage',
    'integration_connections'
  ]
  loop
    execute format(
      'create policy "owner access" on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',
      t
    );
  end loop;
end
$$;

-- Tables scoped through a business.
do $$
declare
  t text;
begin
  foreach t in array array[
    'youtube_channels','youtube_ideas','youtube_research','youtube_scripts',
    'youtube_fact_checks','youtube_videos','youtube_thumbnail_concepts',
    'youtube_analytics','youtube_channel_intelligence','etsy_stores',
    'etsy_opportunities','etsy_products','etsy_listings','etsy_keywords',
    'etsy_analytics'
  ]
  loop
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
  end loop;
end
$$;

create policy "owner access via agent" on public.agent_memory for all
  using (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()));

create policy "owner access via task" on public.task_dependencies for all
  using (exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid()));

create policy "owner access via mission" on public.workflow_runs for all
  using (exists (select 1 from public.missions m where m.id = mission_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from public.missions m where m.id = mission_id and m.owner_id = auth.uid()));

create policy "owner access via script" on public.youtube_script_versions for all
  using (exists (
    select 1 from public.youtube_scripts s
    join public.businesses b on b.id = s.business_id
    where s.id = script_id and b.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.youtube_scripts s
    join public.businesses b on b.id = s.business_id
    where s.id = script_id and b.owner_id = auth.uid()
  ));

create policy "owner access via video" on public.youtube_scenes for all
  using (exists (
    select 1 from public.youtube_videos v
    join public.businesses b on b.id = v.business_id
    where v.id = video_id and b.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.youtube_videos v
    join public.businesses b on b.id = v.business_id
    where v.id = video_id and b.owner_id = auth.uid()
  ));

-- Workflow definitions with a null owner are the built-in library, readable by
-- anyone signed in; owned rows stay private.
create policy "shared or owned workflows" on public.workflow_definitions for select
  using (owner_id is null or auth.uid() = owner_id);
create policy "own workflows are writable" on public.workflow_definitions for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Create a profile row whenever a user signs up.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', 'Operator'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
