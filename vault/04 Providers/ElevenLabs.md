---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Narration
interface: VoiceProvider
related:
  - [[Narration]]
  - [[Subtitles]]
  - [[Rendering Pipeline]]
tags:
  - provider
---

# ElevenLabs

> [!info] Implementation status
> **implemented** — implements `VoiceProvider`

## Setup

1. Create an account at [elevenlabs.io](https://elevenlabs.io)
2. Pick a voice and copy its ID from your voice library
3. Create an API key
4. Set the variables below and restart

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `VOICE_PROVIDER` | yes | Must be `elevenlabs` |
| `VOICE_PROVIDER_API_KEY` | yes | |
| `VOICE_ID` | yes | From your voice library |
| `VOICE_MODEL` | no | Defaults to `eleven_multilingual_v2` |

## Costs

Per character. A 12-minute script is roughly 11,000 characters — about £2–3.

## Limits

Character quota per period; the connection test reports how much is used.

## Authentication

`xi-api-key` header. **Never in a URL.** Asserted by test.

## Failure modes

- **Key rejected** → `auth`, not retried.
- **No voice chosen** → refuses before making any request, so nothing is charged.
- **Duration** is measured by probing the returned audio, never estimated. Every downstream timing hangs off it.

## Related

- [[Narration]]
- [[Subtitles]]
- [[Rendering Pipeline]]
