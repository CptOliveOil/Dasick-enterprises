---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Whole-pipeline tests through the real engine
related:
  - [[Testing Philosophy]]
tags:
  - testing
---

# Integration Tests

These run the real [[Mission Engine]] against the in-memory store with the mock
AI provider. They are slow and they are the most valuable tests here.

| File | Proves |
| --- | --- |
| `production.test.ts` | The full pipeline reaches final approval; a video is never published by approval alone |
| `modes.test.ts` | Demo and Production build **identical** task graphs; no workflow names a vendor |
| `executor-state.test.ts` | An AI-planned mission hands the revision step the approved v2 |
| `script-resolution.test.ts` | A lost script is rebuilt from the archive; the mission recovers |
| `workflow.test.ts` | Definitions resolve; dependencies order correctly |
| `uuid-integrity.test.ts` | An end-to-end sweep finds no blank id in any column |

See [[Faceless YouTube Video]].
