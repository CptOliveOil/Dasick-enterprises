---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Plans and generates the voiceover
related:
  - [[ElevenLabs]]
  - [[Subtitles]]
  - [[Rendering Pipeline]]
tags:
  - agent
---

# Narration

> [!info] Purpose
> Decide delivery, pacing and breaks, then synthesise the audio.

| | |
| --- | --- |
| **Authority** | Level 2 — spends |
| **Capabilities** | `youtube.voiceover.plan` · `youtube.voiceover.generate` |

## Inputs

- The approved script and channel voice settings

## Outputs

- A `youtube_voiceovers` row and a voiceover media asset

## Prompt philosophy

Planning is an AI step; synthesis is a provider step. They are separate so a re-synthesis does not re-plan.

## Failure examples

- Duration was once estimated rather than measured; every downstream timing inherited the error. The adapter now probes the returned audio.

## Future ideas

- Word timings for real caption alignment

## Related

- [[ElevenLabs]]
- [[Subtitles]]
- [[Rendering Pipeline]]
