---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: One row per encode attempt.
migration: `0002`
scope: business-scoped
related:
  - [[Job Queue]]
  - [[Rendering Pipeline]]
tags:
  - table
  - database
---

# youtube_render_jobs

> [!info] Purpose
> One row per encode attempt.

## Key columns

`video_id`, `timeline_id`, `renderer`, `status`, `progress`, `output_asset_id`, `log`, `error`, `duration_ms`

## Relationships

Child of a video and a timeline.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Rendering Pipeline]], [[Job Queue]]

## Migration history

`0002`

## Related

- [[Job Queue]]
- [[Rendering Pipeline]]
