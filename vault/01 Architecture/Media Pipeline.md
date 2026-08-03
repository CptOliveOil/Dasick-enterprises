---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Producing, storing and describing every asset
related:
  - [[Rendering Pipeline]]
  - [[Copyright Review]]
  - [[media_assets]]
  - [[Storage]]
tags:
  - architecture
---

# Media Pipeline

> [!info] Purpose
> Assets are rows plus files. The row records what it is, what it cost, who made it and what licence it carries; the file lives in storage.

**Code** — `lib/media/assets.ts`, `lib/media/storage.ts`

## Responsibilities

- Create `media_assets` rows with provider, cost, dimensions and metadata
- Upload bytes to [[Storage]]
- Record provenance for [[Copyright Review]]

## Inputs

- Produced media from a provider

## Outputs

- A `media_assets` row and a stored file

## Dependencies

- [[Provider Layer]]
- [[Storage]]

## Failure modes

- **An asset with no licence metadata** → classified `unresolved`, which blocks publishing.
- **A row with no reachable file** → reported as such, never rendered as a broken image.

## Future improvements

- Deduplicate identical stock fetches across missions

## Related

- [[Rendering Pipeline]]
- [[Copyright Review]]
- [[media_assets]]
- [[Storage]]
