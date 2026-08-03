---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: SRT and VTT, fitted to the narration that was actually produced
related:
  - [[Rendering Pipeline]]
  - [[youtube_captions]]
tags:
  - architecture
---

# Subtitles

> [!info] Purpose
> Cues estimated from a script drift further with every line. Fitting them to the measured audio removes the accumulation, which is the part a viewer notices.

**Code** — `lib/media/subtitles.ts`

## Responsibilities

- Use provider word timings where available; otherwise estimate and fit
- Emit both SRT and VTT
- Validate: no overlaps, no empty cues, nothing past the audio, readable line lengths

## Inputs

- The script transcript and the measured narration duration

## Outputs

- A `youtube_captions` row carrying cues, VTT and SRT

## Dependencies

- [[Provider Layer]] (subtitle interface)
- [[Rendering Pipeline]] for burned captions

## Failure modes

- **Claiming alignment that was never measured** → `aligned` records which happened, and the review says so.

## Future improvements

- Real forced alignment
- Multi-language tracks

## Related

- [[Rendering Pipeline]]
- [[youtube_captions]]
