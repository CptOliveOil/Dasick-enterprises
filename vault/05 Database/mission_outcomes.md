---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What a finished mission turned out to be worth.
migration: `0007`
scope: owner-scoped
related:
  - [[Business Memory]]
  - [[Never Invent Metrics]]
tags:
  - table
  - database
---

# mission_outcomes

> [!info] Purpose
> What a finished mission turned out to be worth.

## Key columns

`mission_id` (**unique**), `topic`, `category`, `business_kind`, `entity_kind`, `entity_id`, `views`, `ctr`, `watch_time_minutes`, `average_view_percentage`, `revenue`, `rpm`, `ai_cost`, `minutes_taken`, `difficulty`, `success_score`, `notes[]`

## Relationships

One per mission; the unique index prevents double counting in every average agents read.

## Indexes

`(business_id, created_at desc)`, `entity_id`

## Row Level Security

**owner-scoped** — see [[Row Level Security]].

## Used by

[[Business Memory]]

## Migration history

`0007`

## Related

- [[Business Memory]]
- [[Never Invent Metrics]]
