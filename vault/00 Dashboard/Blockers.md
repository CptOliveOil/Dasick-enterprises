---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
related:
  - [[Roadmap]]
  - [[Rendering Pipeline]]
tags:
  - dashboard
---

# Blockers

> [!warning] Rule
> A blocker stays on this page until it is fixed or deliberately accepted. If it
> is accepted, it moves to [[08 Decisions/Index|Decisions]] with a reason.

| Blocker | Area | Impact | Next step |
| --- | --- | --- | --- |
| Scene replacement not built | [[Rendering Pipeline]] | One bad scene forces regenerating all assets | Build targeted replacement |
| Render versioning not built | [[Rendering Pipeline]] | A re-render overwrites the previous one | Add `youtube_render_versions` |
| Music upload UI missing | [[Rendering Pipeline]] | Mixing works; no way to add a track | Small upload screen |
| No video-clip provider | [[Provider Layer]] | Stock video unavailable | Adapter needed |
| Openverse has no video | [[Openverse]] | Falls back to generated stills | Accepted for now |
| Job phases coarse | [[Job Queue]] | `preparing`/`muxing`/`validating` not distinguished | Extend job states |

## Resolved blockers

Kept because the pattern matters more than the fix.

- Blank UUID in the research step → [[Blank UUID In Research]]
- Structured output failing on large packages → [[Structured Output Validation Failure]]
- Script "disappearing" before revision → [[Script Not Found In AI Planned Missions]]
- RLS refusing workspace provisioning → [[RLS Blocks Workspace Provisioning]]
- Renderer producing nothing → [[Zoompan Frame Explosion]]
