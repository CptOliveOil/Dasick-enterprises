---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: SRT and VTT for one video.
migration: `0008`
scope: business-scoped
related:
  - [[Subtitles]]
  - [[Upload Package]]
tags:
  - table
  - database
---

# youtube_captions

> [!info] Purpose
> SRT and VTT for one video.

## Key columns

`video_id`, `script_id`, `language`, `cues[]`, `vtt`, `srt`, `aligned`, `provider`

## Relationships

Child of a video.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Subtitles]], [[Studio Review]], [[Publisher]]

## Migration history

`0008`

## Related

- [[Subtitles]]
- [[Upload Package]]
