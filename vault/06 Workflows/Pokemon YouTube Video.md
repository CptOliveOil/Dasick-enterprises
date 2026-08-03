---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The same pipeline with the specialist research step
key: pokemon_youtube_video
related:
  - [[Pokemon Channel]]
  - [[Pokemon Researcher]]
  - [[Faceless YouTube Video]]
tags:
  - workflow
---

# Pokemon YouTube Video

> [!info] Definition
> `pokemon_youtube_video` in `lib/workflows/definitions.ts`

## Diagram

```mermaid
flowchart LR
    PR[pokemon.research.ideas] --> S[script] --> F[fact_check]
    F -.->|⛔| REST[…the ordinary pipeline, unchanged]
```

## Steps

Identical to [[Faceless YouTube Video]] except the first step is `pokemon.research.ideas`.

## Approvals

The same two gates.

## Retries

The same. See [[Retry Engine]].

## Expected outputs

The same, plus `pokemon_opportunities` rows.

## Artifacts produced

As above, plus `pokemon_opportunities`.

## Related

- [[Pokemon Channel]]
- [[Pokemon Researcher]]
- [[Faceless YouTube Video]]
