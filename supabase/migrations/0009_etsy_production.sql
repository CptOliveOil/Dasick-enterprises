-- ===========================================================================
-- 0009 — Etsy production: design, artwork, mockups and packaging
--
-- The Etsy pipeline stopped at a text-only listing draft — no artwork, no
-- mockups, no packaged deliverable, and no code that ever turned an approved
-- opportunity into a product. This closes that gap the same way the YouTube
-- pipeline closes its own: real assets in `media_assets`, referenced by id
-- from the record that owns them.
--
-- Safe to run against a database carrying 0001–0008. Adds columns; changes
-- nothing that already exists.
-- ===========================================================================

alter table public.media_assets
  add column if not exists product_id uuid references public.etsy_products (id) on delete cascade;

create index if not exists media_assets_product_idx on public.media_assets (product_id, type);

alter table public.media_assets
  drop constraint if exists media_assets_type_check;

alter table public.media_assets
  add constraint media_assets_type_check check (type in (
    'voiceover','image','video_clip','thumbnail','music','sound_effect',
    'final_video','subtitle_file','archive'
  ));

alter table public.etsy_products
  add column if not exists design_concept jsonb not null default '{}'::jsonb,
  add column if not exists artwork_asset_id uuid references public.media_assets (id) on delete set null,
  add column if not exists upscaled_asset_id uuid references public.media_assets (id) on delete set null,
  add column if not exists variant_asset_ids jsonb not null default '{}'::jsonb,
  add column if not exists mockup_asset_ids uuid[] not null default '{}',
  add column if not exists package_asset_id uuid references public.media_assets (id) on delete set null;
