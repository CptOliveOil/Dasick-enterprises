---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Not yet built — keeping every render
related:
  - [[Rendering Pipeline]]
  - [[Scene Replacement]]
  - [[Roadmap]]
tags:
  - planned
  - architecture
---

# Render Versioning

> [!info] Purpose
> A re-render currently overwrites. An approved render must never be silently replaced.

**Code** — _see related pages_

## Responsibilities

- _Planned:_ store render v1, v2, v3 with timeline, script and asset versions, preset, duration and cost

## Inputs

- A completed render

## Outputs

- A version row

## Dependencies

- [[Rendering Pipeline]]

## Failure modes

- Not implemented. A re-render overwrites the previous output asset.

## Future improvements

- Build alongside [[Scene Replacement]]; they share the stale-render concept.

## Related

- [[Rendering Pipeline]]
- [[Scene Replacement]]
- [[Roadmap]]
