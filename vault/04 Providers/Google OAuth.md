---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The credential behind YouTube access
interface: n/a
related:
  - [[YouTube API]]
  - [[Security]]
  - [[Authentication]]
tags:
  - provider
---

# Google OAuth

> [!info] Implementation status
> **implemented** — implements `n/a`

## Setup

Part of the [[YouTube API]] setup. The refresh token is the long-lived credential; everything else is derived from it per call.

## Environment variables

See [[YouTube API]].

## Costs

Free.

## Limits

Refresh tokens can be revoked from the Google account security page.

## Authentication

Refresh token → access token, server-side only. The token never reaches the browser and is scrubbed from any error by `redact()`.

## Failure modes

- **Revoked token** → `auth` failure with a clear remedy.
- **Token in a URL** → never; sent in a POST body. Asserted by test.

## Related

- [[YouTube API]]
- [[Security]]
- [[Authentication]]
