---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Database, auth and storage
interface: DataStore
related:
  - [[Supabase]]
  - [[Row Level Security]]
  - [[Migrations]]
  - [[Storage]]
tags:
  - provider
---

# Supabase Provider

> [!info] Implementation status
> **implemented** — implements `DataStore`

## Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Copy the project URL and anon key
3. Run migrations `0001` → `0008` in order
4. Create your owner account

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public by design; RLS is the protection |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Server-only if used |

## Costs

Free tier is sufficient to start.

## Limits

Storage and row limits on the free tier.

## Authentication

Session cookie → session-scoped client. RLS applies to every query.

## Failure modes

- **Expired session** → `NotSignedIn`, 401. It must never fall back to demo data; that is indistinguishable from deletion.

## Related

- [[Supabase]]
- [[Row Level Security]]
- [[Migrations]]
- [[Storage]]
