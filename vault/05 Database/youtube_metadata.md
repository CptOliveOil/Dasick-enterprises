---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What the video would be published as.
migration: `0002`
scope: business-scoped
related:
  - [[SEO]]
  - [[Upload Package]]
tags:
  - table
  - database
---

# youtube_metadata

> [!info] Purpose
> What the video would be published as.

## Key columns

`video_id`, `title`, `alternative_titles[]`, `description`, `tags[]`, `hashtags[]`, `chapters[]`, `pinned_comment`

## Relationships

Child of a video.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[SEO]], [[Publisher]], [[Upload Package]]

## Migration history

`0002`

## Related

- [[SEO]]
- [[Upload Package]]
