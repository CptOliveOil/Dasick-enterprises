---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Daily performance for a published video.
migration: `0001`
scope: business-scoped
related:
  - [[Analytics]]
  - [[Never Invent Metrics]]
tags:
  - table
  - database
---

# youtube_analytics

> [!info] Purpose
> Daily performance for a published video.

## Key columns

`video_id`, `date`, `views`, `impressions`, `ctr`, `watch_time_minutes`, `average_view_duration_seconds`, `likes`, `comments`, `subscribers_gained`, `revenue`

## Relationships

Read by [[Business Memory]] at brief time.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Analytics]], [[Business Memory]]

## Migration history

`0001`

## Related

- [[Analytics]]
- [[Never Invent Metrics]]
