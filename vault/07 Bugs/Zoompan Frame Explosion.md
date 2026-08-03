---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The renderer produced nothing at all
severity: critical
commit: cbc2671
resolved: 2026-08
related:
  - [[Rendering Pipeline]]
  - [[FFmpeg]]
  - [[Smoke Tests]]
tags:
  - bug
---

# Zoompan Frame Explosion

> [!bug] Problem
> ffmpeg exited with `Nothing was written into output file, because at least one of its streams received no packets`.

## Symptoms

A render that appeared to run produced a zero-byte file.

## Root cause

`fps` was applied **before** `zoompan` in the filter chain. `zoompan` generates
`d` output frames from every *input* frame, so a looped four-second still at
30fps handed it 120 frames and got 14,400 back — eight minutes where four
seconds were wanted. The encode then produced nothing.

## Investigation

Found by the opt-in smoke test on its first run. Isolated by running each
filter combination separately: concat alone worked, zoompan alone worked, xfade
alone worked — zoompan **with** xfade failed.

## Fix

Stills with motion are fed as a **single frame**, not looped, and the rate is
set on the `zoompan` filter itself so the clip lasts exactly `frames / fps`.

## Tests added

`tests/render-smoke.test.ts` — opt-in via `RENDER_SMOKE=1`, renders a real MP4 from local fixtures and probes it. No paid provider.

## Commit

`cbc2671`

## Lessons learned

**The smoke test earned its place immediately.** No unit test would have caught
this; only rendering a real file did.

**A filter that "works in isolation" can fail in combination.** The bug was in
the interaction, not in either filter.

## Related

- [[Rendering Pipeline]]
- [[FFmpeg]]
- [[Smoke Tests]]
