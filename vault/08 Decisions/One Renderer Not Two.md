---
status: accepted
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Strengthen the ffmpeg path rather than adding Remotion
adr: 10
decided: 2026-08
related:
  - [[Rendering Pipeline]]
  - [[Remotion]]
  - [[FFmpeg]]
tags:
  - decision
  - adr
---

# ADR-010 — One Renderer Not Two

> [!success] Decision
> The local ffmpeg renderer is the only renderer. Remotion was considered and not adopted.

**Status** — accepted

## Reason

A second renderer means a second timeline model, and the timeline is where the timing correctness lives.

## Alternatives considered

- **Remotion** — React-based, better for motion graphics, but adds a Node render farm and a parallel timeline.
- **A hosted render service** — adds cost and a network dependency to the one step that is currently free.

## Trade-offs

Motion graphics — animated maps, timelines, diagrams — are harder in raw ffmpeg. That capability is not built.

## Consequences

Rendering is free and local. If Remotion is adopted later it implements the same `VideoRenderer` interface with no workflow change.

## Related

- [[Rendering Pipeline]]
- [[Remotion]]
- [[FFmpeg]]
