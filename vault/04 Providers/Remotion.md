---
status: not-implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Considered, not adopted
interface: VideoRenderer
related:
  - [[Rendering Pipeline]]
  - [[One Renderer Not Two]]
  - [[Provider Layer]]
tags:
  - planned
  - provider
---

# Remotion

> [!info] Implementation status
> **not-implemented** — implements `VideoRenderer`

## Setup

Not used. The existing ffmpeg path already produces YouTube-ready output, and
adding a second renderer would mean two timeline models. See
[[One Renderer Not Two]].

If adopted later it would implement the same `VideoRenderer` interface and
require no workflow change.

## Environment variables

None.

## Costs

Would add a Node render farm cost at scale.

## Limits

n/a

## Authentication

n/a

## Failure modes

- Not implemented.

## Related

- [[Rendering Pipeline]]
- [[One Renderer Not Two]]
- [[Provider Layer]]
