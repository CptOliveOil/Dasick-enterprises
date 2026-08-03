---
status: stable
created: 2026-08-03
updated: 2026-08-03
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
| **Authority** | Level 3 — the highest |
| **Capabilities** | `youtube.publish` |

## Inputs

- An approved video with a rendered file

## Outputs

- A published external id, or a refusal

## Prompt philosophy

Refuses unless the video is approved, the copyright review cleared and a real publisher is connected. Never retried automatically — a retried upload is a duplicate video.

## Failure examples

- A simulated publish must never write `published_external_id`, or the workspace believes a video is live.

## Future ideas

- Scheduled publishing from the review screen

## Related

- [[YouTube API]]
- [[Studio Review]]
- [[Security]]
