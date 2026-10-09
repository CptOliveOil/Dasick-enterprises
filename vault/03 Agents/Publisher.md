---
status: stable
created: 2026-08-03
updated: 2026-10-09
owner: fayaz
summary: The one irreversible action
related:
  - [[YouTube API]]
  - [[Studio Review]]
  - [[Security]]
tags:
  - agent
---

# Publisher

> [!info] Purpose
> Upload the finished video to the connected channel, private by default.

| | |
| --- | --- |
| **Authority** | Level 3 — external actions, each stopping for approval |
| **Held by** | The seeded **YouTube Analyst** (there is no separate Publisher agent). It was level 0 until 2026-10-09, so publish never ran. |
| **Capabilities** | `youtube.publish` |

## Inputs

- An approved video with a rendered file

## Outputs

- A published external id, or a refusal

## Prompt philosophy

Refuses unless the video is approved, the copyright review cleared and a real publisher is connected. Then raises an explicit **Upload to YouTube (private)** approval, and uploads only when that is approved (or the channel enabled auto-publish). Never retried automatically — a retried upload is a duplicate video.

## Failure examples

- A simulated publish must never write `published_external_id`, or the workspace believes a video is live.

## Future ideas

- Scheduled publishing from the review screen

## Related

- [[YouTube API]]
- [[Studio Review]]
- [[Security]]
