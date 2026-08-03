---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Measure, never estimate
adr: 11
decided: 2026-08
related:
  - [[Rendering Pipeline]]
  - [[Subtitles]]
  - [[ElevenLabs]]
tags:
  - decision
  - adr
---

# ADR-011 — Narration Duration Is The Source Of Truth

> [!success] Decision
> Scene timings, caption cues and the render length all derive from the **measured** narration duration.

**Status** — accepted

## Reason

A words-per-minute estimate made before the audio exists is always a little wrong, and every downstream timing inherits the error and compounds it.

## Alternatives considered

- **Trusting the script estimate** — rejected; a voice reading faster or slower drifts further with every line.
- **Scaling only the final scene** — rejected; it ends a documentary on one shot held for a minute.

## Trade-offs

The narration must exist before the timeline can be finalised, which orders the pipeline.

## Consequences

Scene durations scale proportionally. A timeline whose pictures stop before the voice does is refused before an encode is spent.

## Related

- [[Rendering Pipeline]]
- [[Subtitles]]
- [[ElevenLabs]]
