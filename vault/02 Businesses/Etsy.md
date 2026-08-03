---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Research, design, artwork and a packaged deliverable, gated on your listing approval
related:
  - [[etsy_products]]
  - [[etsy_listings]]
  - [[Business Memory]]
  - [[Etsy Researcher]]
  - [[Etsy Product Designer]]
  - [[Etsy Visual Artist]]
  - [[Etsy Listing Agent]]
tags:
  - business
---

# Etsy

> [!info] Goals
> Turn a researched opportunity into a complete, packaged digital product: framed, designed, drawn, upscaled, cropped to every aspect ratio it needs, mocked up, listed and zipped — with nothing published until you approve the listing.

Was marked dormant and explicitly out of scope through several phases. Reopened
when the objective changed from "build more infrastructure" to "make Command
Centre earn money" — see [[Etsy Production Pipeline]] and
[[ADR-015 Etsy Production Reuses The YouTube Pattern]].

## Agents

[[Etsy Researcher]] · [[Etsy Product Designer]] · [[Etsy Visual Artist]] ·
[[Etsy Listing Agent]] · the shared SEO Agent (`seo.keywords`, business-agnostic)

## Capabilities

`etsy.research.opportunities` · `etsy.product.create` · `etsy.design.concept` ·
`etsy.artwork.generate` · `etsy.artwork.upscale` · `etsy.artwork.variants` ·
`etsy.mockups.generate` · `seo.keywords` · `etsy.listing.write` ·
`etsy.package.zip`

## Workflows

[[Etsy Product]] (research) → operator approves one opportunity →
[[Etsy Product Build]] (the full pipeline)

## Metrics

Sales, conversion, seasonality — none collected yet; `etsy_analytics` is per
store and per day, not per listing, so [[Business Memory]] records commerce
outcomes as unknown rather than apportioning. `/etsy/orders` and
`/etsy/analytics` are still empty-state pages — see [[Blockers]].

## Business Memory

Active again from the point the pipeline was rebuilt. No outcomes recorded yet
— nothing has been published.

## Roadmap

No outcomes recorded yet.

## Related

- [[etsy_products]]
- [[etsy_listings]]
- [[Business Memory]]
- [[Etsy Researcher]]
- [[Etsy Product Designer]]
- [[Etsy Visual Artist]]
- [[Etsy Listing Agent]]
