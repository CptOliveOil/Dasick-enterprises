---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The renderer
interface: VideoRenderer
related:
  - [[Rendering Pipeline]]
  - [[Zoompan Frame Explosion]]
  - [[Job Queue]]
tags:
  - provider
---

# FFmpeg

> [!info] Implementation status
> **implemented** — implements `VideoRenderer`

## Setup

Bundled via `ffmpeg-static` — no installation, no account. It is local compute,
so it is genuinely connected in every mode.

Verify your machine can render:

```bash
RENDER_SMOKE=1 npx vitest run tests/render-smoke.test.ts
```

## Environment variables

None.

## Costs

**Free.** Local CPU only.

## Limits

Render time scales with length and preset. A 12-minute `standard` render is minutes.

## Authentication

None.

## Failure modes

- **`fps` before `zoompan`** → frame explosion and empty output. See [[Zoompan Frame Explosion]].
- **Binary missing** → the step blocks with a clear reason.
- **Timeline invalid** → refused before an encode is spent.

## Related

- [[Rendering Pipeline]]
- [[Zoompan Frame Explosion]]
- [[Job Queue]]
