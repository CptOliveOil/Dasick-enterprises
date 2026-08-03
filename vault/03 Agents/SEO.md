---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Title, description, tags, chapters
related:
  - [[Business Memory]]
  - [[youtube_metadata]]
  - [[Upload Package]]
tags:
  - agent
---

# SEO

> [!info] Purpose
> Write what the video is published as.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.metadata` · `seo.keywords` |

## Inputs

- The script and the channel

## Outputs

- A `youtube_metadata` row

## Prompt philosophy

Written for a person first. Chapters must start at 00:00 or the platform ignores the list entirely.

## Failure examples

- Metadata absent at review time is reported as a blocker, not omitted.

## Future ideas

- Titles informed by what actually performed

## Related

- [[Business Memory]]
- [[youtube_metadata]]
- [[Upload Package]]
