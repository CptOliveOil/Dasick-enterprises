---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Classifies provenance and blocks what cannot ship
related:
  - [[Copyright Review]]
  - [[Never Claim Legal Safety]]
  - [[youtube_copyright_reviews]]
tags:
  - agent
---

# Copyright

> [!info] Purpose
> Inspect every visual asset and decide whether the video may proceed.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.copyright.review` |

## Inputs

- `media_assets` and their metadata

## Outputs

- A `youtube_copyright_reviews` row and a licence report

## Prompt philosophy

The model comments; it does not classify. Provenance is decided by lookup, and
the model is explicitly told the classification is not its to change. It is also
told never to state that anything is legally safe.

## Failure examples

- Treating "I generated it" as a defence. An original rendering of a trademarked character is still that character.

## Future ideas

- Per-channel licence policy

## Related

- [[Copyright Review]]
- [[Never Claim Legal Safety]]
- [[youtube_copyright_reviews]]
