---
status: living
created: 2026-08-03
updated: 2026-10-09
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

## Recovery — 2026-10-09 (after ~2 months untouched)

Priority narrowed to **one dependable YouTube pipeline**. Everything below was
verified in this container in **Demo Mode only** — no Supabase, no Anthropic
key, and the network policy blocks Supabase and Openverse. Nothing here is
REAL SERVICE VERIFIED.

| Milestone | State |
| --- | --- |
| 1 Command → research → script → fact check → approval, request changes → v2 | LOCALLY VERIFIED (Demo) |
| 2 Narration plan → narration → visuals → assets → thumbnail → metadata | LOCALLY VERIFIED (Demo, simulated media) |
| 3 Assembly → subtitles → copyright → QC → final review; MP4 plays + seeks (206/416) | LOCALLY VERIFIED (Demo); real FFmpeg render smoke-tested |
| 4 Upload gate → private upload → analytics | UNIT TESTED (recording publisher); never run against YouTube |

Fixed during recovery (bug pages in [[07 Bugs/Index|Bugs]]):
[[A Duration In The Command Turned A Video Into Card Research]] ·
[[ADR-017 A Named Subject Gets A Sourced Research Package]] ·
[[Production Stalled After Six Steps]] ·
[[Final Approval Ran The Upload Step Unasked]] · schema-drift probe
([[Migrations]]) · prefill vs newer models ([[Anthropic]]).

Next: connect real Supabase and confirm the schema, then one real Anthropic run
to script approval.

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
