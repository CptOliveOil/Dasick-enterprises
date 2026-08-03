---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: One owner account, roles defined for later
related:
  - [[Supabase]]
  - [[Security]]
  - [[Authority Model]]
  - [[profiles]]
tags:
  - architecture
---

# Authentication

> [!info] Purpose
> The first profile on a fresh project becomes the owner. Roles exist and are enforced; only `owner` is used today.

**Code** — `lib/auth/session.ts`, `lib/auth/permissions.ts`

## Responsibilities

- Sign in, session, password reset
- Resolve the session to a store and a profile
- Enforce permissions per route

## Inputs

- Credentials, a session cookie

## Outputs

- A session: store, owner id, profile, role, mode

## Dependencies

- [[Supabase]]
- [[Security]]

## Failure modes

- **No session against a configured project** → 401, never demo data.

## Future improvements

- Team members and invitations

## Related

- [[Supabase]]
- [[Security]]
- [[Authority Model]]
- [[profiles]]
