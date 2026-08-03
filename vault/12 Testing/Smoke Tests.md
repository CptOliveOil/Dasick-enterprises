---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Opt-in tests that touch real local tooling
related:
  - [[Rendering Pipeline]]
  - [[FFmpeg]]
tags:
  - testing
---

# Smoke Tests

```bash
RENDER_SMOKE=1 npx vitest run tests/render-smoke.test.ts
```

Renders a real MP4 from local fixtures — two generated stills and eight seconds
of narration — and probes the output for duration, resolution and an audio
track. **No paid provider, no credentials.**

Skipped by default because it depends on a working ffmpeg build and takes real
seconds. A suite that sometimes fails for environmental reasons stops being
believed.

> [!success] It earned its place immediately
> On its first run it found [[Zoompan Frame Explosion]] — a bug no unit test
> could have caught, because only rendering a real file exposed it.
