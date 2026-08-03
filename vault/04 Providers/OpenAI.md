---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Scene stills and thumbnail candidates
interface: ImageProvider
related:
  - [[Asset Agent]]
  - [[Thumbnail]]
  - [[Copyright Review]]
  - [[Media Pipeline]]
tags:
  - provider
---

# OpenAI

> [!info] Implementation status
> **implemented** — implements `ImageProvider`

## Setup

1. Create an account at [platform.openai.com](https://platform.openai.com)
2. Create an API key and add credit
3. Set the variables below and restart

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `IMAGE_PROVIDER` | yes | Must be `openai` |
| `IMAGE_PROVIDER_API_KEY` | yes | |
| `IMAGE_MODEL` | no | Defaults to `gpt-image-1` |

## Costs

~£0.035 per scene still, ~£0.07 per thumbnail (higher quality tier). A documentary needs 25–40 stills, so roughly £1–1.50.

## Limits

Fixed sizes: 1024×1024, 1536×1024, 1024×1536. Landscape requests map to 1536×1024 and crop to 16:9.

## Authentication

Bearer key. **Testing the connection lists models — it generates nothing and costs nothing.**

## Failure modes

- **Prompt refused** → categorised as `moderation` and the step fails. A placeholder is never substituted.
- **No image returned** → treated as a refusal rather than retried.

## Related

- [[Asset Agent]]
- [[Thumbnail]]
- [[Copyright Review]]
- [[Media Pipeline]]
