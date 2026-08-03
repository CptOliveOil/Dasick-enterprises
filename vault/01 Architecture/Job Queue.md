---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Long-running work that must survive a closed browser
related:
  - [[Rendering Pipeline]]
  - [[youtube_render_jobs]]
tags:
  - architecture
---

# Job Queue

> [!info] Purpose
> Rendering and generation take minutes. The job abstraction persists progress so reopening the page does not lose it.

**Code** — `lib/jobs/queue.ts`

## Responsibilities

- Track long-running provider and render work
- Persist status and progress

## Inputs

- A job request from a capability

## Outputs

- A `provider_jobs` or `youtube_render_jobs` row

## Dependencies

- [[Rendering Pipeline]]
- [[Media Pipeline]]

## Failure modes

- **Phases are coarse** — `preparing`/`muxing`/`validating` are not yet distinguished. See [[Blockers]].

## Future improvements

- Finer phases
- Cancellation from the UI

## Related

- [[Rendering Pipeline]]
- [[youtube_render_jobs]]
