---
status: resolved
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Three different faults shared one message
severity: high
commit: 5085f79
resolved: 2026-07
related:
  - [[Anthropic]]
  - [[Agent Engine]]
  - [[Researcher]]
tags:
  - bug
---

# Structured Output Validation Failure

> [!bug] Problem
> A real Anthropic research task failed with `Structured output failed validation after one repair attempt. No JSON object found in the response.`

## Symptoms

The research step failed repeatedly. The message said the model returned prose.

## Root cause

The message covered **three unrelated situations**: the model wrote prose, the
model wrote nothing, or the model wrote valid JSON that ran out of output tokens
before closing its last brace. Only one is the model's fault.

The leading cause was truncation: eleven array fields against `max_tokens: 4096`.

## Investigation

Nothing had logged the raw response, so the actual reply was unknowable. A
script proved all three causes produced the identical message, which was itself
the finding.

## Fix

- Extraction failures categorised: `empty`, `no_json`, `truncated`, `invalid_json`, `schema`
- `stop_reason` trusted over inference for truncation
- Assistant prefill `{` to force JSON when the schema root is an object
- Token floor raised to 8,192; a truncated repair gets 16,384
- The repair prompt now carries the original reply and the specific problem
- Safe diagnostics: provider, model, attempt, stop reason, character count — **never prompts or keys**

## Tests added

`tests/anthropic-structured.test.ts` — 26 tests covering prose, fenced blocks, truncation, empty replies, multi-block responses, repair success and repair failure.

## Commit

`5085f79`

## Lessons learned

**One message for three causes is three bugs.** The categories needed to exist
before any of them could be fixed.

**Log enough to diagnose, never enough to leak.** The absence of any diagnostic
was why the first investigation could only hypothesise.

## Related

- [[Anthropic]]
- [[Agent Engine]]
- [[Researcher]]
