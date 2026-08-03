---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Auth, Postgres and storage
related:
  - [[Database]]
  - [[Authentication]]
  - [[Row Level Security]]
  - [[Storage]]
tags:
  - architecture
---

# Supabase

> [!info] Purpose
> The database and the identity provider. Its presence is also what decides the [[Mode System|mode]]: no Supabase means Demo.

**Code** — `lib/db/index.ts`, `lib/supabase/*`

## Responsibilities

- Session-scoped client per request
- Auth for the owner account
- Storage bucket for media

## Inputs

- Environment configuration and a session cookie

## Outputs

- A store bound to the session user

## Dependencies

- [[Row Level Security]]
- [[Authentication]]
- [[Storage]]

## Failure modes

- **Expired session in a real workspace** → throws `NotSignedIn` and answers 401. It used to fall back to demo data, which is indistinguishable from deletion.

## Future improvements

- Connection pooling for background jobs

## Related

- [[Database]]
- [[Authentication]]
- [[Row Level Security]]
- [[Storage]]
