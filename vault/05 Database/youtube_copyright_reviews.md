---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Provenance verdict per video.
migration: `0008`
scope: business-scoped
related:
  - [[Copyright Review]]
  - [[Never Claim Legal Safety]]
tags:
  - table
  - database
---

# youtube_copyright_reviews

> [!info] Purpose
> Provenance verdict per video.

## Key columns

`video_id`, `verdict`, `summary`, `findings[]`, `attribution_required[]`

## Relationships

Child of a video.

## Indexes

`(video_id, created_at desc)`

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Copyright Review]], [[Studio Review]]

## Migration history

`0008`

## Related

- [[Copyright Review]]
- [[Never Claim Legal Safety]]
