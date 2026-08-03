---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Real figures only, flowing back into memory
related:
  - [[Business Memory]]
  - [[YouTube API]]
  - [[youtube_analytics]]
tags:
  - architecture
---

# Analytics

> [!info] Purpose
> Collected from the platform for a video the workspace actually published. Nothing is estimated, and revenue is deliberately not requested.

**Code** — `lib/agents/production/studio.ts`

## Responsibilities

- Collect daily rows per published video
- De-duplicate by date
- Feed [[Business Memory]]

## Inputs

- A published external id and a date window

## Outputs

- `youtube_analytics` rows

## Dependencies

- [[Provider Layer]] (analytics interface)
- [[Business Memory]]

## Failure modes

- **Zero as "not measured"** → impressions and revenue are not requested, so they are stored as unknown rather than as nothing earned.

## Future improvements

- Impressions and CTR (needs an extra scope)
- Channel-level trends

## Related

- [[Business Memory]]
- [[YouTube API]]
- [[youtube_analytics]]
