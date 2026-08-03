---
status: live
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The faceless documentary pipeline — the reference implementation
related:
  - [[Faceless YouTube Video]]
  - [[Rendering Pipeline]]
  - [[YouTube API]]
  - [[Studio Review]]
  - [[Business Memory]]
tags:
  - business
---

# YouTube Studio

> [!info] Goals
> Produce full documentary videos end to end: research, script, narration, visuals, render, captions, metadata, and a private upload the operator approves.

## Agents

[[Manager]] · [[Researcher]] · [[Fact Checker]] · [[Scriptwriter]] · [[Narration]] · [[Visual Planner]] · [[Asset Agent]] · [[Thumbnail]] · [[SEO]] · [[Quality Control]] · [[Copyright]] · [[Publisher]] · [[Analytics Agent]]

## Capabilities

`youtube.research.package` · `youtube.script.write` · `youtube.script.revise` · `youtube.script.factcheck` · `youtube.voiceover.plan` · `youtube.voiceover.generate` · `youtube.visual_plan` · `youtube.asset_generate` · `youtube.thumbnail.concepts` · `youtube.thumbnail.generate` · `youtube.metadata` · `youtube.video_assemble` · `youtube.subtitles` · `youtube.copyright.review` · `youtube.quality_check` · `youtube.publish` · `youtube.analytics.collect`

## Workflows

[[Faceless YouTube Video]] (the full 16-step pipeline) · [[YouTube Script]] · [[YouTube Ideas]]

## Metrics

Views, click-through, watch time, average view percentage, comments, subscribers gained. Revenue is **not** collected — see [[Never Invent Metrics]].

## Business Memory

1. [[Scene Replacement]] and [[Render Versioning]]
2. Music upload UI
3. Impressions and CTR (needs an extra YouTube scope)

## Roadmap

Every completed mission writes a [[mission_outcomes]] row. Once analytics exist they are pulled in and rendered into every later prompt. See [[Business Memory]].

## Related

- [[Faceless YouTube Video]]
- [[Rendering Pipeline]]
- [[YouTube API]]
- [[Studio Review]]
- [[Business Memory]]
