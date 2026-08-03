---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Provenance decided by lookup, not by a model
related:
  - [[Media Pipeline]]
  - [[Studio Review]]
  - [[Never Claim Legal Safety]]
  - [[youtube_copyright_reviews]]
tags:
  - core
  - architecture
---

# Copyright Review

> [!info] Purpose
> A model can be argued into "probably fine". A lookup table cannot. Classification is deterministic; the model only comments.

**Code** — `lib/production/provenance.ts`, `lib/production/licence-report.ts`

## Responsibilities

- Classify every visual asset from what was recorded about it
- `unresolved` blocks; `fair_use_review_required` needs a person
- Carry attribution into the description
- Produce a downloadable licence report

## Inputs

- `media_assets` rows and their metadata

## Outputs

- A `youtube_copyright_reviews` row and a licence report

## Dependencies

- [[Media Pipeline]]
- [[Approval System]]

## Failure modes

- **Provider matched by slug** → assets store the descriptor *name*; an equality check on `'simulated'` matched nothing and made three guards no-ops. Fixed.
- **Generated ≠ safe** → an original rendering of a trademarked character is still that character.

## Future improvements

- Per-channel licence policy
- Attribution auto-insertion into metadata

## Related

- [[Media Pipeline]]
- [[Studio Review]]
- [[Never Claim Legal Safety]]
- [[youtube_copyright_reviews]]
