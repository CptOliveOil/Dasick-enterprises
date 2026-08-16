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
| Etsy mockups are a local composite | [[Etsy Visual Artist]] | Reads as a design preview, not a photographed product shot | A real mockup template library |
| Etsy production checklist not auto-ticked | [[Etsy Listing Agent]] | Checklist item text is free-form; nothing marks items done as steps complete | Map checklist items to step names, or drop the checklist |
| `/etsy/orders` and `/etsy/analytics` are empty-state pages | [[Etsy]] | No sales or performance data flows in from anywhere yet | Needs an Etsy API connection, out of scope until a shop exists |

## Resolved blockers

Kept because the pattern matters more than the fix.

- Blank UUID in the research step → [[Blank UUID In Research]]
- Structured output failing on large packages → [[Structured Output Validation Failure]]
- Script "disappearing" before revision → [[Script Not Found In AI Planned Missions]]
- RLS refusing workspace provisioning → [[RLS Blocks Workspace Provisioning]]
- Renderer producing nothing → [[Zoompan Frame Explosion]]
- No video could be approved for publishing outside Supabase Storage → [[Approving A Video Was Permanently Disabled Outside Supabase Storage]]
- The Etsy pipeline covered 3 of 11 required product outputs, with no code turning an approved opportunity into a product → [[ADR-015 Etsy Production Reuses The YouTube Pattern]], [[Etsy Product Build]]
- A system-level mission (Operational Readiness) had no way to run business-scoped work without guessing a business or failing three layers down → [[Operational Readiness Fans Out Instead Of Guessing A Business]], [[ADR-016 Fan Out Child Missions Rather Than Multi-Business Steps]]
- `workflow_runs` kept a hard foreign key to a table built-in workflows deliberately never populate, so any built-in-workflow mission failed against a real database → [[Workflow Runs Referenced A Workflow That Was Never A Database Row]]
