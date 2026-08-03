---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The narration plan and its audio.
migration: `0002`
scope: business-scoped
related:
  - [[Narration]]
  - [[ElevenLabs]]
tags:
  - table
  - database
---

# youtube_voiceovers

> [!info] Purpose
> The narration plan and its audio.

## Key columns

`script_id`, `video_id`, `voice_provider`, `voice_id`, `segments[]`, `audio_duration`, `audio_asset_id`, `status`

## Relationships

Links a script to an audio asset.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Narration]], [[Rendering Pipeline]], [[Subtitles]]

## Migration history

`0002`

## Related

- [[Narration]]
- [[ElevenLabs]]
