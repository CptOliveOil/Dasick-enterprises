-- ===========================================================================
-- 0008 — Studio: captions and copyright review
--
-- The last two records the production pipeline needs before a video can be
-- published. Both are business-scoped, matching every other content table, so
-- they inherit the same "owner access via business" policy shape.
--
-- Safe to run against a database carrying 0001–0007. Adds two tables; changes
-- nothing that already exists.
-- ===========================================================================

create table if not exists public.youtube_captions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  script_id uuid references public.youtube_scripts (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  language text not null default 'en',
  cues jsonb not null default '[]'::jsonb,
  vtt text not null default '',
  -- False when timings were estimated from the script rather than heard from
  -- the narration. Estimated cues drift, and quality control reports them as
  -- provisional rather than claiming a sync nobody measured.
  aligned boolean not null default false,
  provider text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists youtube_captions_video_idx
  on public.youtube_captions (video_id);

create table if not exists public.youtube_copyright_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  video_id uuid references public.youtube_videos (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  -- 'clear' | 'attribution_required' | 'review_needed' | 'blocked'
  verdict text not null default 'review_needed',
  summary text not null default '',
  findings jsonb not null default '[]'::jsonb,
  attribution_required jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists youtube_copyright_reviews_video_idx
  on public.youtube_copyright_reviews (video_id, created_at desc);

alter table public.youtube_captions enable row level security;
alter table public.youtube_copyright_reviews enable row level security;

-- The same business-scoped policy as every other content table. `using` and
-- `with check` are deliberately identical: a row the database lets you write is
-- a row it lets you read, which is what stops "written but invisible".
do $$
declare
  t text;
begin
  foreach t in array array['youtube_captions', 'youtube_copyright_reviews']
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
