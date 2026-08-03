---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: A product concept, carried through design, artwork and packaging to a listing
migration: '0001, extended by 0009'
scope: business-scoped
related:
  - [[Etsy]]
  - [[etsy_listings]]
  - [[media_assets]]
tags:
  - table
  - database
---

# etsy_products

> [!info] Purpose
> The record one Etsy Product Build works on, from an approved opportunity to
> every asset a packaged listing needs.

## Key columns

`opportunity_id`, `name`, `status`, `price`

**Added in `0009`** — nullable, filled in as the build progresses:

- `design_concept` (jsonb) — style, palette, mood, composition notes and the
  exact prompt sent to the image provider
- `artwork_asset_id`, `upscaled_asset_id` → `media_assets`
- `variant_asset_ids` (jsonb) — aspect ratio (`"1:1"`, `"4:5"`, `"16:9"`) to
  asset id
- `mockup_asset_ids` (uuid[])
- `package_asset_id` → `media_assets`, the zip — set only once the listing is
  approved

## Relationships

Child of an opportunity; parent of a listing; now also the owner of every
image and the package `media_assets` row created for it, via the new
`media_assets.product_id` column.

## Indexes

`media_assets_product_idx` on `(product_id, type)`, added in `0009`.

## Row Level Security

**business-scoped** — see [[Row Level Security]]. Unaffected by `0009`; new
columns carry no access implication of their own.

## Used by

[[Etsy Product Designer]] · [[Etsy Visual Artist]] · [[Etsy Listing Agent]]

## Migration history

`0001` — table created. `0009` — artwork, mockup and packaging columns
added.

## Related

- [[Etsy]]
- [[etsy_listings]]
- [[media_assets]]
- [[Etsy Product Build]]
