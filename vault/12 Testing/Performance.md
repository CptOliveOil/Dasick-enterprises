---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Where time actually goes
related:
  - [[Rendering Pipeline]]
  - [[Job Queue]]
tags:
  - testing
---

# Performance

| Operation | Typical | Notes |
| --- | --- | --- |
| Full test suite | ~15s | Two integration files dominate |
| A model call | 5–40s | Structured output on large schemas is slowest |
| Narration (12 min) | 1–3 min | Provider side |
| One image | 10–30s | Provider side |
| Render (12 min, standard) | minutes | Local CPU; scales with length and preset |
| Dossier assembly | <200ms | Reads only |

## Rules

- **Never hold a browser request open for a render.** See [[Job Queue]].
- **Never load a full video into browser memory.** The player streams.
- **Reads must stay free.** A dossier calls no provider.
