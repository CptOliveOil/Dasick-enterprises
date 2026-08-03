---
status: living
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Structured output, prompting and where models fail here
related:
  - [[Anthropic]]
  - [[Agent Engine]]
  - [[Structured Output Validation Failure]]
tags:
  - research
---

# AI Research

## What we have learned the hard way

**Structured output fails in three distinct ways** and they need different fixes:
prose instead of JSON, an empty reply, and valid JSON truncated before its last
brace. See [[Structured Output Validation Failure]].

**Truncation is the most common** on schemas with many array fields. The remedy
is room, not a better prompt — but the prompt should also say that completeness
beats volume.

**Assistant prefill works.** Starting the reply with `{` when the schema root is
an object dramatically reduces prose responses. It also makes prose *look*
truncated, so `stop_reason` must be trusted over inference.

**Enum ordering matters for the mock provider.** The simulated provider takes the
first variant, so schemas list the benign value first — `verified`, `pass`,
`advisory`. A schema that listed `blocking` first made every demo fail its own
copyright review.

**A model must not be asked to decide anything it can be argued out of.**
Provenance is a lookup; the model comments. See [[Never Claim Legal Safety]].


## Related

- [[Anthropic]]
- [[Agent Engine]]
- [[Structured Output Validation Failure]]
