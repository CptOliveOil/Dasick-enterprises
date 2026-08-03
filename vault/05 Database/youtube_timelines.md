---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The exact timing used for a render.
migration: `0002`
scope: business-scoped
related:
  - [[Rendering Pipeline]]
  - [[Render Versioning]]
tags:
  - table
  - database
---

# youtube_timelines

> [!info] Purpose
> The exact timing used for a render.

## Key columns

`video_id`, `items[]`, `total_duration`, `width`, `height`, `fps`, `narration_asset_id`, `music_asset_id`, `burn_in_captions`

## Relationships

Consumed by the renderer.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Rendering Pipeline]]

## Migration history

`0002`

## Related

- [[Rendering Pipeline]]
- [[Render Versioning]]
