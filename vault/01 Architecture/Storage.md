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

**Code** — `lib/media/storage.ts`, `lib/media/assets.ts` (`playableUrl()`), `app/api/media/[id]/route.ts`

## Responsibilities

- Upload produced media
- Resolve a local path for ffmpeg
- Never claim a `public_url` that does not resolve
- Give the UI a URL it can actually load, via `playableUrl()`, whether or
  not a direct `public_url` exists

## `public_url` vs. `playableUrl()`

`public_url` answers one narrow question: is there a directly-reachable URL
(only Supabase Storage's signed URL sets one). It is deliberately `null` for
every local-storage asset — that is correct, not a bug.

Anything showing media to a person needs a different, broader question
answered: "can this be watched at all." That is `playableUrl(asset)` in
`lib/media/assets.ts` — `public_url` if set, otherwise `/api/media/{id}`
(the authenticated route) when the asset is `ready` with a `storage_path`,
otherwise `null`. Every dossier and the upload package call this, not
`public_url` directly. See
[[Approving A Video Was Permanently Disabled Outside Supabase Storage]] for
what went wrong when a reader used `public_url` for that question instead.

`/api/media/[id]` supports `Range` requests (206 Partial Content), which a
multi-minute rendered video needs to be seekable at all.

## Inputs

- Bytes and a path

## Outputs

- A storage path and, where applicable, a public URL

## Dependencies

- [[Supabase]]
- [[Media Pipeline]]

## Failure modes

- **A row with a path but no file** → the review says the asset is not reachable rather than showing a broken player.
- **A reader treating `public_url === null` as "unplayable"** → wrong outside Supabase Storage; call `playableUrl()` instead. See [[Approving A Video Was Permanently Disabled Outside Supabase Storage]].

## Future improvements

- Signed URLs with expiry for private media

## Related

- [[Media Pipeline]]
- [[Supabase]]
- [[Security]]
