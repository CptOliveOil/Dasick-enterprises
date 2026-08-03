---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Not yet built — replacing one scene without redoing the mission
related:
  - [[Rendering Pipeline]]
  - [[Render Versioning]]
  - [[Roadmap]]
tags:
  - planned
  - architecture
---

# Scene Replacement

> [!info] Purpose
> A single bad image should cost one regeneration, not a whole asset pass.

**Code** — _see related pages_

## Responsibilities

- _Planned:_ edit a scene prompt, regenerate its image, replace or upload, change duration or transition

## Inputs

- A scene id and an action

## Outputs

- A replaced asset and a stale render marker

## Dependencies

- [[Rendering Pipeline]]
- [[Media Pipeline]]

## Failure modes

- Not implemented. Today a retry of the assets step regenerates every scene.

## Future improvements

- Build it. This is the highest-value remaining item in [[Roadmap]].

## Related

- [[Rendering Pipeline]]
- [[Render Versioning]]
- [[Roadmap]]
