---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: The one specialist agent
related:
  - [[Pokemon Channel]]
  - [[Copyright Review]]
  - [[pokemon_opportunities]]
tags:
  - pokemon
  - agent
---

# Pokemon Researcher

> [!info] Purpose
> Research Pokémon topics without fabricating market data or assuming rights.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `pokemon.research.ideas` · `pokemon.tcg.research` · `pokemon.etsy.opportunities` |

## Inputs

- An instruction naming a Pokémon subject

## Outputs

- `pokemon_opportunities` rows

## Prompt philosophy

Live market data — prices, PSA populations, auction results — is **refused**
rather than recalled. IP risk is assessed from the concept text, not from what
the model claims about it.

## Failure examples

- A wall chart described as "of our own" was scored too low until the downgrade regex was narrowed.

## Future ideas

- Card Analyst, Trend Scout, Etsy Product Researcher — designed, deliberately unbuilt

## Related

- [[Pokemon Channel]]
- [[Copyright Review]]
- [[pokemon_opportunities]]
