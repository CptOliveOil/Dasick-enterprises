---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Turns the script into scenes with a visual strategy
related:
  - [[Asset Agent]]
  - [[Rendering Pipeline]]
  - [[youtube_scenes]]
tags:
  - agent
---

# Visual Planner

> [!info] Purpose
> Decide what each beat should show and how the asset should be obtained.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.visual_plan` |

## Inputs

- The script and the narration duration

## Outputs

- `youtube_scenes` rows

## Prompt philosophy

Each scene declares an `asset_strategy`, so the [[Asset Agent]] knows whether to generate, search or wait for an upload.

## Failure examples

- Planned durations drift from the real narration; reconciled by [[Rendering Pipeline]].

## Future ideas

- Motion graphics as a first-class strategy

## Related

- [[Asset Agent]]
- [[Rendering Pipeline]]
- [[youtube_scenes]]
