---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Timeline, encode and the checks around them
related:
  - [[Media Pipeline]]
  - [[Subtitles]]
  - [[FFmpeg]]
  - [[Job Queue]]
  - [[youtube_timelines]]
tags:
  - core
  - architecture
---

# Rendering Pipeline

> [!info] Purpose
> One renderer, local ffmpeg. The narration duration is the source of truth, and a timeline that would render as black is refused before an encode is spent on it.

**Code** — `lib/integrations/providers/ffmpeg-renderer.ts`, `lib/agents/production/assemble.ts`, `lib/production/timeline-validation.ts`

## Responsibilities

- Scale scene durations proportionally to the measured narration
- Validate coverage, gaps, overlaps and missing assets
- Encode 1920×1080, 30fps, H.264 + AAC, `+faststart`
- Apply Ken Burns, crossfades, burned captions and the music mix

## Inputs

- A timeline, narration audio, scene assets, optional music and captions

## Outputs

- A `final_video` media asset and a `youtube_render_jobs` row

## Dependencies

- [[Media Pipeline]]
- [[Provider Layer]] (renderer interface)

## Failure modes

- **`fps` before `zoompan`** → frame explosion, empty output. See [[Zoompan Frame Explosion]].
- **Pictures shorter than narration** → blocked before encoding; it renders happily as black otherwise.
- **ffmpeg missing** → the step blocks rather than failing obscurely.

## Future improvements

- [[Scene Replacement]]
- [[Render Versioning]]
- Music upload UI
- Finer job phases

## Related

- [[Media Pipeline]]
- [[Subtitles]]
- [[FFmpeg]]
- [[Job Queue]]
- [[youtube_timelines]]
