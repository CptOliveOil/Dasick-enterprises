---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Openly licensed stock imagery
interface: StockMediaProvider
related:
  - [[Asset Agent]]
  - [[Copyright Review]]
  - [[Never Claim Legal Safety]]
tags:
  - provider
---

# Openverse

> [!info] Implementation status
> **implemented** — implements `StockMediaProvider`

## Setup

No account. Set `STOCK_PROVIDER=openverse` and restart.

Chosen over conventional stock libraries for one reason: **every result carries
its licence and creator in the response**. That is the field [[Copyright Review]]
needs and the field most APIs make you infer.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `STOCK_PROVIDER` | yes | Must be `openverse` |

## Costs

**Free.** Most licences require attribution, which is carried into the licence report.

## Limits

Images only — no video. Searches are restricted to commercially usable and modifiable material, because the output is a monetised video.

## Authentication

None.

## Failure modes

- **A result with no licence data** → refused rather than used.
- **Video requested** → returns an empty list rather than pretending, so the visual step falls back to a generated still.

## Related

- [[Asset Agent]]
- [[Copyright Review]]
- [[Never Claim Legal Safety]]
