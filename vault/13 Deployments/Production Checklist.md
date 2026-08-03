---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Before the first real video
related:
  - [[Deployment Guide]]
  - [[Security]]
tags:
  - deployment
---

# Production Checklist

- [ ] Migrations `0001` → `0008` applied
- [ ] Owner account created; no other profile exists
- [ ] **AI budget activated** — monthly ceiling, per-mission ceiling, approval threshold
- [ ] `ANTHROPIC_API_KEY` set and tested
- [ ] Provider connections tested one at a time — each test is **free**
- [ ] `RENDER_SMOKE=1` passes on the deployment machine
- [ ] Settings → Status shows the expected mode
- [ ] No secret in any committed file
- [ ] `npx vitest run` green
- [ ] `npm run build` succeeds

## First real run

Start with a **short** script, not a 12-minute one. See
[[Daily Workflow]] for the sequence.
