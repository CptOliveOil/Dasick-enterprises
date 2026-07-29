-- Command Centre — faceless video production pipeline.
--
-- Extends 0001. Scenes and videos gain production fields rather than being
-- duplicated into new tables; everything genuinely new gets its own.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Media assets
-- ---------------------------------------------------------------------------

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  scene_id uuid references public.youtube_scenes (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  type text not null check (type in (
    'voiceover','image','video_clip','thumbnail','music','sound_effect','final_video','subtitle_file'
  )),
  provider text not null default '',
  provider_asset_id text,
  storage_path text,
  -- Only ever set when the asset is genuinely reachable at that URL.
  public_url text,
  mime_type text not null default 'application/octet-stream',
  duration double precision,
  width integer,
  height integer,
  file_size bigint,
  generation_prompt text,
  generation_cost double precision not null default 0,
  status text not null default 'pending'
    check (status in ('pending','generating','ready','failed','replaced')),
  -- True only for clearly-marked Demo Mode placeholders.
  simulated boolean not null default false,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_owner_idx on public.media_assets (owner_id, created_at desc);
create index if not exists media_assets_video_idx on public.media_assets (video_id, type);
create index if not exists media_assets_scene_idx on public.media_assets (scene_id);

-- ---------------------------------------------------------------------------
-- Scene and video extensions
-- ---------------------------------------------------------------------------

alter table public.youtube_scenes
  add column if not exists business_id uuid references public.businesses (id) on delete cascade,
  add column if not exists mission_id uuid references public.missions (id) on delete set null,
  add column if not exists start_time_estimate double precision not null default 0,
  add column if not exists visual_type text not null default 'image',
  add column if not exists animation_notes text not null default '',
  add column if not exists importance smallint not null default 3,
  add column if not exists asset_strategy text not null default 'generated_image',
  add column if not exists asset_id uuid references public.media_assets (id) on delete set null,
  add column if not exists status text not null default 'planned',
  add column if not exists error text;

alter table public.youtube_videos
  add column if not exists stage text not null default 'ideas',
  add column if not exists blocked_reason text,
  add column if not exists thumbnail_asset_id uuid references public.media_assets (id) on delete set null,
  add column if not exists final_asset_id uuid references public.media_assets (id) on delete set null,
  add column if not exists voiceover_id uuid,
  add column if not exists timeline_id uuid,
  add column if not exists metadata_id uuid,
  add column if not exists estimated_cost double precision not null default 0,
  add column if not exists actual_cost double precision not null default 0,
  -- Set only after a genuine upload returns an id.
  add column if not exists published_external_id text;

alter table public.youtube_thumbnail_concepts
  add column if not exists concept_title text not null default '',
  add column if not exists contrast_strategy text not null default '',
  add column if not exists click_psychology text not null default '',
  add column if not exists image_prompt text not null default '',
  add column if not exists confidence double precision not null default 0,
  add column if not exists asset_id uuid references public.media_assets (id) on delete set null,
  add column if not exists selected boolean not null default false;

-- ---------------------------------------------------------------------------
-- Voiceover
-- ---------------------------------------------------------------------------

create table if not exists public.youtube_voiceovers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  script_id uuid references public.youtube_scripts (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  voice_provider text not null default '',
  voice_id text not null default '',
  voice_name text not null default '',
  speed double precision not null default 1,
  settings jsonb not null default '{}'::jsonb,
  language text not null default 'en-GB',
  narration_style text not null default '',
  segments jsonb not null default '[]'::jsonb,
  -- Measured from the rendered audio once ready, not estimated.
  audio_duration double precision,
  audio_asset_id uuid references public.media_assets (id) on delete set null,
  generation_cost double precision not null default 0,
  status text not null default 'planned'
    check (status in ('planned','generating','ready','failed','blocked')),
  error text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_voiceovers_video_idx on public.youtube_voiceovers (video_id);

-- ---------------------------------------------------------------------------
-- Timelines and renders
-- ---------------------------------------------------------------------------

create table if not exists public.youtube_timelines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid not null references public.youtube_videos (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total_duration double precision not null default 0,
  width integer not null default 1920,
  height integer not null default 1080,
  fps integer not null default 30,
  narration_asset_id uuid references public.media_assets (id) on delete set null,
  music_asset_id uuid references public.media_assets (id) on delete set null,
  subtitle_asset_id uuid references public.media_assets (id) on delete set null,
  burn_in_captions boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft','ready','rendering','rendered','failed')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_timelines_video_idx on public.youtube_timelines (video_id);

create table if not exists public.provider_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  mission_id uuid references public.missions (id) on delete set null,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  scene_id uuid references public.youtube_scenes (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  kind text not null check (kind in ('voiceover','image','video_clip','stock_fetch','render','thumbnail')),
  provider text not null default '',
  -- The provider's own job handle, when it issues one.
  external_id text,
  status text not null default 'queued'
    check (status in ('queued','submitted','processing','completed','failed','cancelled')),
  progress integer not null default 0,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  estimated_cost double precision not null default 0,
  actual_cost double precision,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists provider_jobs_owner_idx on public.provider_jobs (owner_id, created_at desc);
create index if not exists provider_jobs_status_idx on public.provider_jobs (status, kind);

create table if not exists public.youtube_render_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid not null references public.youtube_videos (id) on delete cascade,
  timeline_id uuid references public.youtube_timelines (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  job_id uuid references public.provider_jobs (id) on delete set null,
  renderer text not null default '',
  status text not null default 'queued',
  progress integer not null default 0,
  output_asset_id uuid references public.media_assets (id) on delete set null,
  log text not null default '',
  error text,
  duration_ms integer,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_render_jobs_video_idx on public.youtube_render_jobs (video_id);

-- ---------------------------------------------------------------------------
-- Quality control and metadata
-- ---------------------------------------------------------------------------

create table if not exists public.youtube_quality_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid not null references public.youtube_videos (id) on delete cascade,
  mission_id uuid references public.missions (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  verdict text not null check (verdict in ('pass','warning','fail')),
  issues jsonb not null default '[]'::jsonb,
  summary text not null default '',
  -- Facts measured from the rendered file, not inferred.
  measured jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists youtube_quality_checks_video_idx
  on public.youtube_quality_checks (video_id, created_at desc);

create table if not exists public.youtube_metadata (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid not null references public.youtube_videos (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  title text not null,
  alternative_titles text[] not null default '{}',
  description text not null default '',
  short_description text not null default '',
  tags text[] not null default '{}',
  hashtags text[] not null default '{}',
  chapters jsonb not null default '[]'::jsonb,
  pinned_comment text not null default '',
  version integer not null default 1,
  selected boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists youtube_metadata_video_idx on public.youtube_metadata (video_id, version desc);

-- ---------------------------------------------------------------------------
-- Budgets and production settings
-- ---------------------------------------------------------------------------

create table if not exists public.production_budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  currency text not null default 'GBP',
  -- A hard ceiling. Approval cannot override it.
  max_cost_per_video double precision not null default 25,
  max_image_spend double precision not null default 10,
  max_video_spend double precision not null default 12,
  max_voice_spend double precision not null default 5,
  approval_threshold double precision not null default 5,
  concurrency integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, business_id)
);

create table if not exists public.production_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel_id uuid references public.youtube_channels (id) on delete set null,
  voice_provider text not null default '',
  voice_id text not null default '',
  voice_name text not null default '',
  voice_speed double precision not null default 1,
  language text not null default 'en-GB',
  narration_style text not null default '',
  width integer not null default 1920,
  height integer not null default 1080,
  fps integer not null default 30,
  captions_enabled boolean not null default true,
  burn_in_captions boolean not null default false,
  music_mode text not null default 'none' check (music_mode in ('none','uploaded','provider')),
  music_asset_id uuid references public.media_assets (id) on delete set null,
  music_volume double precision not null default 0.12,
  music_fade_in double precision not null default 2,
  music_fade_out double precision not null default 3,
  -- Publishing is an external action; off until deliberately enabled.
  auto_publish_after_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, business_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.media_assets enable row level security;
alter table public.youtube_voiceovers enable row level security;
alter table public.youtube_timelines enable row level security;
alter table public.provider_jobs enable row level security;
alter table public.youtube_render_jobs enable row level security;
alter table public.youtube_quality_checks enable row level security;
alter table public.youtube_metadata enable row level security;
alter table public.production_budgets enable row level security;
alter table public.production_settings enable row level security;

-- Tables carrying owner_id directly.
do $$
declare
  t text;
begin
  foreach t in array array['media_assets','provider_jobs','production_budgets','production_settings']
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
    'youtube_voiceovers','youtube_timelines','youtube_render_jobs',
    'youtube_quality_checks','youtube_metadata'
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

-- ---------------------------------------------------------------------------
-- Storage bucket for generated media.
--
-- Private: assets are reached through the application's authenticated route or
-- a short-lived signed URL, never a public link.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('command-centre-media', 'command-centre-media', false)
on conflict (id) do nothing;

create policy "owners read their media"
  on storage.objects for select
  using (bucket_id = 'command-centre-media' and owner = auth.uid());

create policy "owners write their media"
  on storage.objects for insert
  with check (bucket_id = 'command-centre-media' and owner = auth.uid());

create policy "owners replace their media"
  on storage.objects for update
  using (bucket_id = 'command-centre-media' and owner = auth.uid());

create policy "owners delete their media"
  on storage.objects for delete
  using (bucket_id = 'command-centre-media' and owner = auth.uid());
