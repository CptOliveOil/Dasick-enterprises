---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: public_url was the only signal for "playable", and LocalMediaStorage never sets it
severity: critical
commit: TBD
resolved: 2026-08
related:
  - [[Storage]]
  - [[Studio Review]]
  - [[Media Pipeline]]
tags:
  - bug
---

# Approving A Video Was Permanently Disabled Outside Supabase Storage

> [!bug] Problem
> No video could ever be approved for publishing in Demo Mode, or in any
> deployment without Supabase Storage configured. The studio dossier always
> showed "There is no playable file. Approving for publishing is disabled
> until there is one" — even for a video that had rendered correctly and sat
> on disk, finished, with a real duration and file size.

## Symptoms

- The final-approval screen (`/youtube/studio/[id]`) always reported the
  render as unplayable, regardless of whether ffmpeg had actually produced a
  file.
- `finalAsset.status === 'ready'`, `file_size` and `duration` were all
  correct — only the "can I watch it" gate was wrong.
- This is the single blocker that stops **every** YouTube video from
  finishing production end to end, discovered while auditing the repository
  for what stops Command Centre shipping a complete video today.

## Root cause

Two different things were being asked through one field.

`lib/media/storage.ts` documents `public_url` as "only ever set when a real,
reachable URL exists" — deliberately. `LocalMediaStorage.write()` always
returns `publicUrl: null`, because a local file is not a public URL; it is
only reachable through the authenticated `/api/media/[id]` route, which
checks ownership before serving bytes. `SupabaseMediaStorage.write()` does
set a real (signed, 7-day) URL.

`lib/approvals/dossier/studio.ts` then asked a second question — "is there
something the operator can watch" — using the *same* field:
`const playable = Boolean(finalAsset?.public_url)`. That equates "has a
directly-reachable URL" with "is playable", which is only true when Supabase
Storage is configured. Every local-storage deployment — Demo Mode included —
answers `playable = false` for a video that was, in fact, finished and
sitting on disk.

The same conflation existed in `lib/approvals/dossier/media.ts` (the
in-progress media review) and `lib/production/upload-package.ts` (the
downloadable package's file links).

A second, independent gap sat underneath this: the dossier's "cannot
approve" text was descriptive only. Nothing in `resolveApproval`
(`lib/workflows/approvals.ts`) actually checked playability before recording
an `approve` decision — the Approve button was never disabled, and a direct
`POST /api/approvals/[id]` call would have gone through and marked an
unwatched, unplayable video "ready to publish."

## Investigation

Traced from the studio dossier's `playable` computation back to
`MediaStorage.write()`, comparing the local and Supabase drivers side by
side. `LocalMediaStorage` unconditionally returns `publicUrl: null` with a
comment explaining the design intent ("served through an authenticated route
… so the link only works for someone who can already see the workspace") —
the null was correct *for that field*; the bug was every downstream reader
treating null as "nothing to play" instead of "no direct URL, check the
authenticated route." Grepped every `.public_url` usage across the codebase
to confirm the same conflation appeared in three places, then checked
whether the approve action itself enforced playability — it did not.

## Fix

Added `playableUrl()` in `lib/media/assets.ts`: returns `public_url` if set,
otherwise `/api/media/{id}` when the asset is `ready` with a `storage_path`,
otherwise `null`. `public_url` itself is untouched — it keeps meaning
exactly what its comment says. `playableUrl()` is the thing anything showing
media to a person should call.

Switched `studio.ts`, `media.ts` and `upload-package.ts` to use it.

Closed the enforcement gap: `resolveApproval` now runs
`unplayableVideoBlock()` before an `approve` decision on a `video` kind is
recorded, alongside the existing `sourcePolicyBlock` and `unresolvedClaims`
gates. It throws `ApprovalRefused` (409, not 500) with the same reasoning the
dossier already showed, so the rule holds through every path — UI, approvals
list, or a direct API call — not just the one screen that happened to be
open.

Also added `Range` request support to `/api/media/[id]/route.ts` (206
Partial Content), since a route with no `Range` handling loads the entire
file into memory and cannot seek — a real blocker for a 10+ minute rendered
video once it actually became playable.

## Tests added

`tests/studio.test.ts`:
- `'treats a locally-stored render with no public URL as playable through the authenticated route'` — dossier-level: asserts the media panel's `url` falls back to `/api/media/{id}`.
- `'refuses the approve decision itself when there is no playable video, not just the dossier text'` — calls `resolveApproval` directly and asserts it throws, and that the approval stays `pending`.
- `'allows the approve decision through when the render is locally stored with no public URL'` — the positive case: `resolveApproval` succeeds for a `ready` local asset with `public_url: null`.

Reverting `playableUrl()` to `Boolean(finalAsset?.public_url)` makes all three fail.

## Commit

TBD — pending push.

## Lessons learned

**A null with a documented reason is still a null everyone else has to
interpret correctly.** `public_url: null` was exactly right for what
`LocalMediaStorage` promises; the bug was every reader assuming null meant
"nothing to show" instead of checking what null meant *for that storage
driver*. When a field's meaning is narrower than what callers actually need
to know, give callers a function that answers their real question, not the
raw field.

**Advisory text in a UI is not enforcement.** The dossier said "you cannot
approve this" for months (in review terms) without anything actually
stopping the approve request. A rule the operator was told matters —
"never approve work you cannot fully inspect" — has to be checked at the
one place every path through goes, the same way `sourcePolicyBlock` and
`unresolvedClaims` already were. Copy the existing gate pattern rather than
inventing a new enforcement point.

**Local-only setups are not an edge case here.** Demo Mode and any
Supabase-less deployment run through `LocalMediaStorage` by default — a bug
that only shows up without Supabase Storage configured was blocking the
default path, not a rare one.

## Related

- [[Storage]]
- [[Studio Review]]
- [[Media Pipeline]]
