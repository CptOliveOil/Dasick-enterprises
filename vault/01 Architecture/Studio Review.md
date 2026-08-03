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
tags:
  - architecture
---

# Studio Review

> [!info] Purpose
> The playable video, both thumbnails, the metadata, the captions, every licence, the quality report and the cost by provider — on one page.

**Code** — `lib/approvals/dossier/studio.ts`, `app/youtube/studio/[id]/page.tsx`

## Responsibilities

- Assemble the studio dossier for a `video` approval
- Disable approval when there is no playable file
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

- **Approving without watching** → structurally prevented; approve is disabled without a playable file.

## Future improvements

- Inline scene scrubbing
- Thumbnail A/B selection

## Related

- [[Approval Dossier]]
- [[Copyright Review]]
- [[Upload Package]]
