---
status: accepted
created: 2026-10-09
updated: 2026-10-09
owner: fayaz
summary: A Pokémon video request that names its subject runs youtube_video_full, not the ideas-first Pokémon workflow
adr: 17
decided: 2026-10
related:
  - [[Pokemon YouTube Video]]
  - [[Faceless YouTube Video]]
  - [[Mission Engine]]
  - [[A Duration In The Command Turned A Video Into Card Research]]
tags:
  - decision
  - adr
---

# ADR-017 — A Named Subject Gets A Sourced Research Package

> [!success] Decision
> "Make a Pokémon video **about X**" runs `youtube_video_full`, whose first
> step is `youtube.research.package` on X. Only "make a Pokémon video" with no
> subject runs `pokemon_youtube_video`, where the specialist chooses one.

**Status** — accepted

## Reason

`pokemon.research.ideas` is an idea search. Its prompt deliberately ranges
across lore, games, anime and cards, returns ten opportunities, and hands the
first to the Scriptwriter. For "a documentary about the history of Charizard
cards" that means:

- the subject the operator chose may not be the one that gets scripted;
- there is no research package — no facts, sources, timeline or uncertain
  claims — so the script approval showed **0 sources**, and the fact checker
  had nothing to check against.

The operator's target flow is Research → **Sources** → Script → Fact check.
Only the research package produces sources.

## Alternatives rejected

- **Insert `youtube.research.package` after the ideas step inside
  `pokemon_youtube_video`.** Needs step keys renamed (`research` is what the
  Scriptwriter reads) on a workflow existing missions already reference, and
  still spends a model call generating ten ideas nobody asked for.
- **Make the ideas step narrow itself when given a subject.** Still yields no
  sourced package.
- **Always use `youtube_video_full` for Pokémon.** Loses the specialist where
  it is genuinely useful: choosing a subject.

## Trade-offs

The Pokémon specialist's prompt rules (never invent prices, valuations or
grading populations) do not run on a named-subject video. The research
package's own rules (never invent a source; mark uncertain claims) and the
Fact Checker cover the same ground less specifically. Revisit if real scripts
show invented market figures.

## Consequences

- Named-subject Pokémon videos get the full tail: subtitles, copyright review,
  publish, analytics.
- `pokemon_youtube_video` was brought to the same tail at the same time — it
  had silently fallen behind when those steps were added to the full pipeline.
  `tests/pokemon.test.ts` now asserts the two tails are identical.
