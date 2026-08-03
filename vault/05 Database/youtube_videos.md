---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The production record.
migration: `0001`, production fields in `0002`
scope: business-scoped
related:
  - [[Studio Review]]
  - [[Rendering Pipeline]]
  - [[Upload Package]]
tags:
  - table
  - database
---

# youtube_videos

> [!info] Purpose
> The production record.

## Key columns

`script_id`, `mission_id`, `number`, `title`, `status`, `stage`, `blocked_reason`, `thumbnail_asset_id`, `final_asset_id`, `voiceover_id`, `timeline_id`, `metadata_id`, `estimated_cost`, `actual_cost`, `published_external_id`

## Relationships

The hub of the production pipeline.

## Indexes

`script_id`, `mission_id`

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Rendering Pipeline]], [[Studio Review]], [[Publisher]]

## Migration history

`0001`, production fields in `0002`

## Related

- [[Studio Review]]
- [[Rendering Pipeline]]
- [[Upload Package]]
