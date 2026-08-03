---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Where media files actually live
related:
  - [[Media Pipeline]]
  - [[Supabase]]
  - [[Security]]
tags:
  - architecture
---

# Storage

> [!info] Purpose
> Supabase storage in a real workspace, the local filesystem in Demo Mode. `public_url` is only ever set when a file is genuinely reachable.

**Code** — `lib/media/storage.ts`

## Responsibilities

- Upload produced media
- Resolve a local path for ffmpeg
- Never claim a URL that does not resolve

## Inputs

- Bytes and a path

## Outputs

- A storage path and, where applicable, a public URL

## Dependencies

- [[Supabase]]
- [[Media Pipeline]]

## Failure modes

- **A row with a path but no file** → the review says the asset is not reachable rather than showing a broken player.

## Future improvements

- Signed URLs with expiry for private media

## Related

- [[Media Pipeline]]
- [[Supabase]]
- [[Security]]
