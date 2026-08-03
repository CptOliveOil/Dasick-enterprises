---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Everything that ships with a video
related:
  - [[Studio Review]]
  - [[Media Pipeline]]
  - [[Upload Package API]]
tags:
  - architecture
---

# Upload Package

> [!info] Purpose
> MP4, thumbnail, captions, metadata, chapters, transcript, sources, licence report and cost report — assembled from stored rows, with blockers listed.

**Code** — `lib/production/upload-package.ts`

## Responsibilities

- Assemble the package on request, never cached
- List blockers that must clear before publishing means anything

## Inputs

- A video id

## Outputs

- A structured package plus a Markdown document

## Dependencies

- [[Copyright Review]]
- [[Media Pipeline]]

## Failure modes

- **Missing sections omitted silently** → a section with no record says so. A missing licence report and an empty one mean different things.

## Future improvements

- A real zip download containing the files themselves

## Related

- [[Studio Review]]
- [[Media Pipeline]]
- [[Upload Package API]]
