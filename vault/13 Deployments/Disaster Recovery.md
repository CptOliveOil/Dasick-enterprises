---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: What to do when something is lost
related:
  - [[Database]]
  - [[Storage]]
tags:
  - deployment
---

# Disaster Recovery

## A mission is stuck

`GET /api/missions/<id>/trace` — see [[Mission Trace API]]. It separates
*removed* from *never written* from *never valid*.

## A script cannot be found

It is almost certainly not deleted. `youtube_script_versions` is append-only and
the resolver rebuilds the head row from it. See
[[Script Not Found In AI Planned Missions]].

## A render is wrong

Retry only the render step. See [[Retry Engine]]. Do **not** re-run research,
script or narration — that re-pays for completed work.

## A provider key leaked

1. Revoke it at the provider immediately
2. Issue a new one and update `.env.local`
3. Restart
4. Check no committed file contains it: `git log -p | grep -i "api.key"`

Errors are scrubbed by `redact()`, so a key should not be in the database. See
[[Secrets Never Leave The Server]].

## Database rollback

Migrations are additive and never rewritten. Restore from a Supabase backup;
re-running migrations against a restored database is safe.

## A video was published by mistake

`unpublish()` sets it back to private. YouTube has no delete-that-restores — the
video stops being visible and still exists. This is why uploads default to
**private**.
