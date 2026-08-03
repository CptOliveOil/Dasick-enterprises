---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The source gate
related:
  - [[Islam App]]
  - [[source_resolutions]]
  - [[source_policies]]
tags:
  - agent
---

# Islamic Source Checker

> [!info] Purpose
> Verify citations and hold the pipeline until every claim is settled.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `islamic.source_verify` · `islamic.script_review` |

## Inputs

- A script or research package

## Outputs

- An `islamic_source_checks` row and a `source` approval

## Prompt philosophy

The gate cannot be closed while claims remain unresolved — approving wholesale would turn it into the click-through it exists to prevent. "Override" is one of the ways to settle a claim, and it is recorded.

## Failure examples

- n/a

## Future ideas

- Reference library per channel

## Related

- [[Islam App]]
- [[source_resolutions]]
- [[source_policies]]
