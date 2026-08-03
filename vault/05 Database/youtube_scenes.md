---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The storyboard.
migration: `0002`
scope: business-scoped
related:
  - [[Visual Planner]]
  - [[Rendering Pipeline]]
  - [[Scene Replacement]]
tags:
  - table
  - database
---

# youtube_scenes

> [!info] Purpose
> The storyboard.

## Key columns

`video_id`, `scene_number`, `start_time_estimate`, `duration_seconds`, `narration`, `visual_type`, `image_prompt`, `asset_strategy`, `asset_id`, `transition`, `on_screen_text`

## Relationships

Child of a video; each points at a `media_assets` row.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Visual Planner]], [[Rendering Pipeline]], [[Copyright Review]]

## Migration history

`0002`

## Related

- [[Visual Planner]]
- [[Rendering Pipeline]]
- [[Scene Replacement]]
