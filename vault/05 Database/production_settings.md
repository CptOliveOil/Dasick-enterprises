---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Per-channel production configuration.
migration: `0002`, `render_preset` added later
scope: owner-scoped
related:
  - [[Rendering Pipeline]]
  - [[Subtitles]]
tags:
  - table
  - database
---

# production_settings

> [!info] Purpose
> Per-channel production configuration.

## Key columns

`voice_id`, `voice_speed`, `language`, `narration_style`, `width`, `height`, `fps`, `captions_enabled`, `burn_in_captions`, `music_mode`, `music_asset_id`, `music_volume`, `music_fade_in`, `music_fade_out`, `render_preset`, `auto_publish_after_approval`

## Relationships

One per business.

## Indexes

—

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Rendering Pipeline]], [[Narration]], [[Subtitles]]

## Migration history

`0002`, `render_preset` added later

## Related

- [[Rendering Pipeline]]
- [[Subtitles]]
