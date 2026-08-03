---
status: implemented
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The model behind every `ai` capability
interface: AIProvider
related:
  - [[Agent Engine]]
  - [[Structured Output Validation Failure]]
  - [[Budget System]]
tags:
  - provider
---

# Anthropic

> [!info] Implementation status
> **implemented** — implements `AIProvider`

## Setup

1. Create an account at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Put it in `.env.local` — never in a commit, never in a chat

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Server-only |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-5` |

## Costs

Per token. Roughly £0.30–0.80 for a full documentary mission.

## Limits

Output token ceiling matters: structured responses use a floor of 8,192 and a repair may raise it to 16,384. See [[Structured Output Validation Failure]].

## Authentication

Bearer key, server-side only.

## Failure modes

- **Response is prose, not JSON** → one repair attempt with the original reply attached, then fail.
- **Response truncated** → detected via `stop_reason`, and the repair gets double the tokens.
- **Not connected in a real workspace** → the step stops. Nothing is simulated.

## Related

- [[Agent Engine]]
- [[Structured Output Validation Failure]]
- [[Budget System]]
