---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Test a provider connection using its own cheapest round trip.
method: POST
path: /api/providers
related:
  - [[Provider Layer]]
  - [[Security]]
  - [[04 Providers/Index|Providers]]
tags:
  - api
---

# Providers API

```http
POST /api/providers
```

Test a provider connection using its own cheapest round trip.

## Authentication

Session cookie; `integrations.manage` — testing uses server credentials.

## Request

```json
{ "kind": "voice" }
```

## Response

```json
{ "ok": true, "detail": "Connected. Tier creator — 1,000 of 100,000 characters used.",
  "descriptor": { "kind": "voice", "name": "ElevenLabs", "requiredEnv": ["VOICE_PROVIDER", "…"] } }
```

## Errors

> [!important] Testing never generates
> Every test is the provider's free call — read the subscription, list models,
> name the channel. **Opening Settings must never spend money.** Descriptors name
> the variables required, never their values.

## Related

- [[Provider Layer]]
- [[Security]]
- [[04 Providers/Index|Providers]]
