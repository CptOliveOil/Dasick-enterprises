---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Listing drafting, then packaging the approved deliverable
related:
  - [[Etsy]]
  - [[etsy_listings]]
  - [[Etsy Visual Artist]]
tags:
  - agent
---

# Etsy Listing Agent

> [!info] Purpose
> Draft a listing for approval, then package everything into a zip once it is
> approved.

| | |
| --- | --- |
| **Authority** | Level 1 |
| **Capabilities** | `etsy.listing.write`, `etsy.package.zip` |

## Inputs

- A product, its keywords, its aspect-ratio variants and its mockups (from
  [[Etsy Product Designer]] and [[Etsy Visual Artist]])

## Outputs

- An `etsy_listings` row
- `etsy_products.package_asset_id` — a zip of the listing text, the design
  concept and every finished image, built only after the operator approves
  the listing

## Prompt philosophy

Publishing is always a separate, gated action. Packaging happens after
approval, not before — nothing leaves the operator's hands describing a
product they have not signed off.

## Failure examples

- n/a

## Future ideas

- The production checklist on `etsy_products` is written by
  [[Etsy Product Designer]] and never ticked off automatically as steps
  complete — it is descriptive, not load-bearing. Wiring it up would need the
  checklist items to map onto concrete step names, which the current
  free-text checklist does not guarantee.

## Related

- [[Etsy]]
- [[etsy_listings]]
- [[Etsy Visual Artist]]
