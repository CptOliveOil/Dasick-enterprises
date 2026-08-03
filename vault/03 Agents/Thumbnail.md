---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Concepts and rendered candidates
related:
  - [[OpenAI]]
  - [[Studio Review]]
  - [[youtube_thumbnail_concepts]]
tags:
  - agent
---

# Thumbnail

> [!info] Purpose
> Produce several distinct directions and render them.

| | |
| --- | --- |
| **Authority** | Level 2 — spends |
| **Capabilities** | `youtube.thumbnail.concepts` · `youtube.thumbnail.generate` |

## Inputs

- The script and its hook

## Outputs

- Concepts and thumbnail assets

## Prompt philosophy

Concepts must state the specific curiosity they create, not "it looks good", and must not promise what the video does not deliver.

## Failure examples

- Thumbnails and scene stills were once one use case; they want different shapes and quality tiers.

## Future ideas

- A/B selection informed by [[Business Memory]]

## Related

- [[OpenAI]]
- [[Studio Review]]
- [[youtube_thumbnail_concepts]]
