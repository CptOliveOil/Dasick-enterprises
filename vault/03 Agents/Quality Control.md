---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The last automated gate
related:
  - [[Copyright Review]]
  - [[Studio Review]]
  - [[youtube_quality_checks]]
tags:
  - agent
---

# Quality Control

> [!info] Purpose
> Measure the real output and refuse to pass anything unfit to publish.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.quality_check` |

## Inputs

- The rendered video, captions, thumbnail, metadata, provenance

## Outputs

- A `youtube_quality_checks` row and the final approval

## Prompt philosophy

Deterministic findings always beat the model's. A simulated asset in a real workspace is blocking, full stop.

## Failure examples

- The simulated-asset check matched nothing for a while because assets store the provider *name*, not a slug.

## Future ideas

- Loudness measurement and subtitle sync verification

## Related

- [[Copyright Review]]
- [[Studio Review]]
- [[youtube_quality_checks]]
