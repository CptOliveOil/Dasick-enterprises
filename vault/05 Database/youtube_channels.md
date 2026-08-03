---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The channel a business publishes to.
migration: `0001`
scope: business-scoped
related:
  - [[YouTube Studio]]
  - [[YouTube API]]
tags:
  - table
  - database
---

# youtube_channels

> [!info] Purpose
> The channel a business publishes to.

## Key columns

`name`, `handle`, `niche`, `target_audience`, `external_id`

## Relationships

Referenced by videos and analytics.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[SEO]], [[Publisher]], [[Analytics]]

## Migration history

`0001`

## Related

- [[YouTube Studio]]
- [[YouTube API]]
