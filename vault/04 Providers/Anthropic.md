---
status: implemented
created: 2026-08-03
updated: 2026-10-09
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

## Model compatibility (2026-10-09 audit)

- Default `claude-sonnet-4-5` is still **active** (checked against the current
  API model list); nothing forces a change.
- **Assistant prefill returns a 400 on every 4.6+ and 5.x model.** The adapter
  prefilled `{` on every structured call, so moving `ANTHROPIC_MODEL` forward
  would have failed every agent run. `acceptsPrefill()` now sends it only to
  models known to accept it; newer models rely on the prompt and the existing
  parse-and-repair path. Not yet REAL SERVICE VERIFIED on a newer model.
- Native structured outputs (`output_config.format`) would be the better long
  term answer on newer models — **rejected for now**: it changes the request
  shape for every capability and cannot be verified without paid calls.
- `PRICING` only lists 4.5-generation models; a newer model's cost estimates
  fall back to whatever `priceFor` defaults to — check before switching.
