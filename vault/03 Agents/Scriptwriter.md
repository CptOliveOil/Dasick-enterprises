---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Writes and revises the documentary
related:
  - [[Researcher]]
  - [[Fact Checker]]
  - [[youtube_scripts]]
  - [[Approval Dossier]]
tags:
  - agent
---

# Scriptwriter

> [!info] Purpose
> Turn a research package into a structured script, and revise it from operator notes.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `youtube.script.write` · `youtube.script.revise` |

## Inputs

- A research package; operator notes on a revision

## Outputs

- A `youtube_scripts` row and a `youtube_script_versions` row

## Prompt philosophy

Structure is demanded: a cold open with no channel branding, a pattern
interrupt, a payoff answering the hook. Claims must not exceed what the research
supports; uncertainty must be phrased as uncertainty.

## Failure examples

- A revision could not find its own script in AI-planned missions. See [[Script Not Found In AI Planned Missions]].

## Future ideas

- Style memory per channel, learned from what performed

## Related

- [[Researcher]]
- [[Fact Checker]]
- [[youtube_scripts]]
- [[Approval Dossier]]
