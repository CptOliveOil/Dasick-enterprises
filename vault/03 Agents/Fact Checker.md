---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Verifies every claim in a draft and raises the script gate
related:
  - [[Scriptwriter]]
  - [[Approval System]]
  - [[youtube_fact_checks]]
tags:
  - agent
---

# Fact Checker

> [!info] Purpose
> Check each claim, give a verdict and a reason, and stop the pipeline if anything is likely wrong.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.script.factcheck` |

## Inputs

- The resolved script

## Outputs

- A `youtube_fact_checks` row and the script approval

## Prompt philosophy

Verdicts are `verified`, `needs_review`, `unsourced` or `potentially_incorrect`,
and `potentially_incorrect` blocks. Rhetorical statements are explicitly not
claims, so the checker is not rewarded for volume.

## Failure examples

- It once fact-checked the literal string `(script unavailable)` and passed,
  producing a real approval for a script it never read. See
  [[Script Not Found In AI Planned Missions]]. It now fails instead.

## Future ideas

- Source fetching, so verification is not from memory

## Related

- [[Scriptwriter]]
- [[Approval System]]
- [[youtube_fact_checks]]
