---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Obtains the picture for each scene
related:
  - [[OpenAI]]
  - [[Openverse]]
  - [[Copyright Review]]
  - [[media_assets]]
tags:
  - agent
---

# Asset Agent

> [!info] Purpose
> Generate or source every scene visual, recording provenance as it goes.

| | |
| --- | --- |
| **Authority** | Level 2 — spends |
| **Capabilities** | `youtube.asset_generate` |

## Inputs

- Scenes with strategies

## Outputs

- `media_assets` rows with licence metadata

## Prompt philosophy

Provenance is recorded at the moment of acquisition. Reconstructing it later is guesswork, and guesswork is what [[Copyright Review]] refuses to do.

## Failure examples

- An asset with no recorded licence is `unresolved` and blocks publishing.

## Future ideas

- Deduplicate repeated stock fetches

## Related

- [[OpenAI]]
- [[Openverse]]
- [[Copyright Review]]
- [[media_assets]]
