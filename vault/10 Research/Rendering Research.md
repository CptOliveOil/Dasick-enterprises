---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: ffmpeg behaviour worth remembering
related:
  - [[Rendering Pipeline]]
  - [[FFmpeg]]
  - [[Zoompan Frame Explosion]]
tags:
  - research
---

# Rendering Research

## Filter chain

**`zoompan` generates `d` frames per *input* frame.** Applied after `fps` to a
looped still it multiplies rather than sets duration. Feed it a single frame and
let it own the length. See [[Zoompan Frame Explosion]].

**`xfade` offsets are cumulative minus overlaps already consumed.** Getting this
wrong produces a video that is correct at the start and progressively wrong.

**A filter that works alone can fail in combination.** zoompan worked; xfade
worked; together they produced nothing.

## Encoding

| Preset | x264 speed | CRF | For |
| --- | --- | --- | --- |
| draft | ultrafast | 28 | Watching once to judge the edit |
| standard | veryfast | 21 | The default; indistinguishable after YouTube re-encodes |
| high | slow | 18 | A master to hand the platform |

`+faststart` matters for streaming. `yuv420p` matters for compatibility.

## Timing

The narration duration is the source of truth. See
[[Narration Duration Is The Source Of Truth]].


## Related

- [[Rendering Pipeline]]
- [[FFmpeg]]
- [[Zoompan Frame Explosion]]
