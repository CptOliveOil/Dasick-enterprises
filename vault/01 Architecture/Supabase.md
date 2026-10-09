---
status: stable
created: 2026-08-03
updated: 2026-10-09
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

**Code** — `lib/db/index.ts`, `lib/supabase/*`, `lib/db/schema-check.ts`

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

- **Project paused (free tier, after inactivity)** → fully configured, answers
  nothing; sign-in fails too. Settings → Status now asks the database on every
  load and shows **NOT CONNECTED · Configured · not answering** rather than
  CONNECTED-because-the-env-vars-are-set. Fix: resume the project in the
  Supabase dashboard.
- **Schema behind the code** → see [[Migrations]]. Settings → Status names each
  missing migration; a store error on a missing column now says so.
- **Expired session in a real workspace** → throws `NotSignedIn` and answers 401. It used to fall back to demo data, which is indistinguishable from deletion.

## Future improvements

- Connection pooling for background jobs

## Related

- [[Database]]
- [[Authentication]]
- [[Row Level Security]]
- [[Storage]]
