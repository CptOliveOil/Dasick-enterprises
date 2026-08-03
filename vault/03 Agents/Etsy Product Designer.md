---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Turns an approved opportunity into a product brief, then a design concept
related:
  - [[Etsy]]
  - [[etsy_products]]
  - [[Etsy Visual Artist]]
tags:
  - agent
---

# Etsy Product Designer

> [!info] Purpose
> Frame the product, then design what it should look like before any artwork
> is generated.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `etsy.product.create`, `etsy.design.concept` |

## Inputs

- An approved `etsy_opportunities` row

## Outputs

- An `etsy_products` row (`etsy.product.create`)
- `etsy_products.design_concept` — style, palette, mood, composition notes
  and the exact prompt handed to the image provider (`etsy.design.concept`)

## Prompt philosophy

The design concept is written as a complete, standalone image-generation
prompt and explicitly forbidden from naming a real brand, character,
franchise or living artist — the same IP discipline the Pokémon and YouTube
visual pipelines already enforce, applied here because this prompt goes
straight to an image provider with nothing to check it afterwards.

## Failure examples

- n/a — new capability, no incidents recorded yet.

## Future ideas

- None outstanding.

## Related

- [[Etsy]]
- [[etsy_products]]
- [[Etsy Visual Artist]]
