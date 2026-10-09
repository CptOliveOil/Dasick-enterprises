---
status: resolved
created: 2026-10-09
updated: 2026-10-09
owner: fayaz
summary: "Create a 10-minute documentary about the history of Charizard cards" created a one-step research mission instead of a video, and any requested length was ignored
severity: high
commit:
resolved: 2026-10-09
related:
  - [[Mission Engine]]
  - [[Pokemon Channel]]
  - [[Scriptwriter]]
tags: [bug]
---

# A Duration In The Command Turned A Video Into Card Research

> [!bug] Problem
> The headline command — "Create a 10-minute documentary about the history of
> Charizard cards." — produced a mission titled *Pokémon card research* with a
> single `pokemon.tcg.research` task. No script, no approval, no video.

## Symptoms
Found during the October 2026 recovery by POSTing the command to
`/api/command` against a fresh `next start` in Demo Mode. The response had
`plan.workflow: null`, one step, and the reply "The Pokémon Researcher is
working through 10 card topics" — the `10` came from "10-minute".

## Root cause
Two faults, in the local router (`lib/agents/manager.ts`), which is what
plans every command whenever no live model is available — and the fallback
when the model's plan does not validate:

1. `MAKE_ONE_VIDEO` allowed only `new|faceless|youtube|full|long-form` between
   the article and the noun. "a **10-minute** documentary" failed it, so the
   next Pokémon route — card research, triggered by the word "cards" — won.
   "Make a Pokémon video" failed the same way.
2. Even on a route that did reach a video workflow, the operator's length was
   never read. `youtube.script.write` used `task.input.target_minutes ?? 16`,
   and nothing ever set `target_minutes`. A 10-minute request asked Claude for
   16 minutes (~2,500 words) in its own explicit instruction, contradicting the
   objective text it was also shown.

## Investigation
The tests covered "Create a faceless video about …" — the one modifier the
regex already allowed — so the suite was green while the command the operator
actually types did not work. Model planning was not involved: no
`ANTHROPIC_API_KEY`, so `planned_locally: true`.

## Fix
- `MAKE_ONE_VIDEO` also accepts `pokémon` and a duration
  (`10-minute`, `10 minute`, `ten minute`, `12-min`, `…-long`) as modifiers.
  The article is still required, so "topics that could make good videos" stays
  research.
- `requestedMinutes()` reads an explicit duration (1–60) from the instruction;
  `handleCommand` stores it as `mission.context.target_minutes` for every plan,
  model or local.
- The Scriptwriter reads `task.input.target_minutes`, then
  `mission.context.target_minutes`, then 16.

Not changed: the model planner's prompt, the route order, the other routes.

## Tests added
`tests/pokemon.test.ts` — the exact headline command routes to
`pokemon_youtube_video` with `target_minutes: 10`; "Make a ten minute Pokémon
video …" produces a Scriptwriter prompt asking for 10 minutes.

## Commit
(see git log — "Route the headline video command to production")

## Lessons learned
Test the sentence the operator actually types, not a tidier paraphrase of it.
A keyword router with an allow-list of adjectives fails on the first adjective
nobody listed — and fails *silently into a different, plausible mission*, which
is worse than refusing.

## Related
- [[Mission Engine]]
- [[Script Not Found In AI Planned Missions]]
