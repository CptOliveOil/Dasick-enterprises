---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The documentary itself.
migration: `0001`
scope: business-scoped
related:
  - [[Scriptwriter]]
  - [[Script Not Found In AI Planned Missions]]
  - [[youtube_script_versions]]
tags:
  - table
  - database
---

# youtube_scripts

> [!info] Purpose
> The documentary itself.

## Key columns

`business_id`, `idea_id`, `research_id`, `task_id`, `title`, `sections[]`, `word_count`, `estimated_duration_seconds`, `tone`, `status`, `version`

## Relationships

`task_id` is what lets a mission find its own scripts when every reference is lost.

## Indexes

—

## Row Level Security

**business-scoped** — see [[Row Level Security]].

## Used by

[[Scriptwriter]], [[Fact Checker]], [[Rendering Pipeline]]

## Migration history

`0001`

## Related

- [[Scriptwriter]]
- [[Script Not Found In AI Planned Missions]]
- [[youtube_script_versions]]
