---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Every file the system holds.
migration: '0002, extended by 0009'
scope: owner-scoped
related:
  - [[Media Pipeline]]
  - [[Copyright Review]]
  - [[Storage]]
  - [[etsy_products]]
tags:
  - table
  - database
---

# media_assets

> [!info] Purpose
> Every file the system holds — YouTube's and, since `0009`, Etsy's.

## Key columns

`type`, `provider`, `storage_path`, `public_url`, `mime_type`, `duration`, `width`, `height`, `file_size`, `generation_prompt`, `generation_cost`, `status`, `metadata`, `product_id` (added `0009`)

`type` gained an `archive` value in `0009` — currently only the Etsy product
zip. `public_url` is only ever set by Supabase Storage's signed URL; anything
that needs to *show* an asset must call `playableUrl()`
(`lib/media/assets.ts`), not read `public_url` directly — see
[[Approving A Video Was Permanently Disabled Outside Supabase Storage]].

## Relationships

Referenced by scenes, videos, voiceovers and timelines — and now by
`etsy_products`, via `product_id`. An asset carries exactly one of `video_id`
or `product_id`; nothing sets both.

## Indexes

`media_assets_product_idx` on `(product_id, type)`, added `0009`.

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Media Pipeline]], [[Copyright Review]], [[Rendering Pipeline]], [[Etsy Visual Artist]], [[Etsy Listing Agent]]

## Migration history

`0002` — table created. `0009` — `product_id`, `archive` type.

## Related

- [[Media Pipeline]]
- [[Copyright Review]]
- [[Storage]]
- [[etsy_products]]
