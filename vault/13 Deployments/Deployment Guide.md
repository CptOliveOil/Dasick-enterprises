---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Getting Command Centre running
related:
  - [[Environment Setup]]
  - [[Production Checklist]]
tags:
  - deployment
---

# Deployment Guide

## Local

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

With no Supabase configuration this runs in **Demo Mode** on seeded in-memory
data. Nothing can spend. See [[Mode System]].

## Real workspace

1. Create a Supabase project
2. Run migrations `0001` → `0008` **in order** — see [[Migrations]]
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Restart, create your owner account
5. **Set an AI budget before anything else** — nothing runs without one
6. Add providers one at a time, testing each — see [[Environment Setup]]

## Verify

```bash
npx tsc --noEmit
npx vitest run
npm run build
RENDER_SMOKE=1 npx vitest run tests/render-smoke.test.ts
```
