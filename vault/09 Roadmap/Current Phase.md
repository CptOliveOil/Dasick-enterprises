---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
  - [[Roadmap]]
  - [[Blockers]]
tags:
  - roadmap
---

# Current Phase

> [!abstract] Studio — making Production Mode operable
> Real provider adapters exist. The renderer produces real MP4s. What remains is
> the last mile: replacing a bad scene without redoing the mission, and keeping
> every render.

## Done in this phase

- [x] Nine provider interfaces, three modes, one workflow — `c12e37f`
- [x] Real adapters: [[ElevenLabs]], [[OpenAI]], [[Openverse]], [[YouTube API]] — `a8805c1`
- [x] Renderer strengthened; presets; timeline validation — `cbc2671`
- [x] SRT and VTT fitted to real narration — `cbc2671`
- [x] Deterministic provenance and the licence report — `cbc2671`
- [x] [[Studio Review]] — `cbc2671`

## Not done

- [ ] [[Scene Replacement]]
- [ ] [[Render Versioning]]
- [ ] Music upload UI
- [ ] Finer [[Job Queue]] phases
- [ ] Caption mode picker

## Exit criteria

A 12-minute documentary produced end to end with real providers, reviewed in
[[Studio Review]], one scene replaced, re-rendered, and uploaded private.
