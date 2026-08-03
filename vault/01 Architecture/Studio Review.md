---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The final screen before a video may be published
related:
  - [[Approval Dossier]]
  - [[Copyright Review]]
  - [[Upload Package]]
  - [[Storage]]
tags:
  - architecture
---

# Studio Review

> [!info] Purpose
> The playable video, both thumbnails, the metadata, the captions, every licence, the quality report and the cost by provider — on one page.

**Code** — `lib/approvals/dossier/studio.ts`, `app/youtube/studio/[id]/page.tsx`

## Responsibilities

- Assemble the studio dossier for a `video` approval
- Refuse approval when there is no playable file — enforced in
  `resolveApproval` (`lib/workflows/approvals.ts`), not only shown as text in
  the dossier
- Offer the upload package and licence report as downloads

## Inputs

- A video approval

## Outputs

- A dossier with media, metadata, captions, licences, quality and ledger panels

## Dependencies

- [[Approval Dossier]]
- [[Copyright Review]]
- [[Rendering Pipeline]]

## Failure modes

- **Approving without watching** → structurally prevented; `resolveApproval` refuses an `approve` decision on a `video` kind when [[Storage]]'s `playableUrl()` returns null. See [[Approving A Video Was Permanently Disabled Outside Supabase Storage]] — the field this used to check (`public_url`) is only ever set by Supabase Storage, so it under-counted "playable" until this was fixed.

## Future improvements

- Inline scene scrubbing
- Thumbnail A/B selection

## Related

- [[Approval Dossier]]
- [[Copyright Review]]
- [[Upload Package]]
- [[Storage]]
